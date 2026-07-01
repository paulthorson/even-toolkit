import type { VoiceLayerConfig, VoiceLayerState, VoiceIntent, ActionContext, AlwaysOnConfig } from './types'
import type { AudioSource } from '../stt/types'
import { classifyLocally } from './intent-classifier'
import { VoiceNavRouter } from './voice-router'
import { extractActionParams } from './action-params'

const VOICE_FINAL_SILENCE_MS = 2000

function joinTranscript(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join(' ')
}

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let len = 0
  while (len < max && a[len] === b[len]) len++
  return len
}

function similarToken(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if ((a.length >= 4 || b.length >= 4) && (a.startsWith(b) || b.startsWith(a))) return true
  return commonPrefixLength(a, b) >= Math.min(4, Math.max(2, Math.min(a.length, b.length) - 1))
}

function looksLikeRewrite(previous: string, next: string): boolean {
  const prevTokens = normalizedTokens(previous)
  const nextTokens = normalizedTokens(next)
  if (!prevTokens.length || !nextTokens.length) return false

  const comparable = Math.min(3, prevTokens.length, nextTokens.length)
  let similar = 0
  for (let i = 0; i < comparable; i++) {
    if (similarToken(prevTokens[i]!, nextTokens[i]!)) similar++
  }

  return similar >= Math.max(1, Math.ceil(comparable * 0.6))
}

function mergeTranscript(previous: string, next: string): string {
  const prev = previous.trim()
  const incoming = next.trim()
  if (!prev) return incoming
  if (!incoming) return prev
  if (incoming.startsWith(prev)) return incoming
  if (prev.endsWith(incoming)) return prev
  if (looksLikeRewrite(prev, incoming)) return incoming

  const maxOverlap = Math.min(prev.length, incoming.length)
  for (let len = maxOverlap; len > 0; len--) {
    if (prev.slice(-len) === incoming.slice(0, len)) {
      return `${prev}${incoming.slice(len)}`
    }
  }
  return `${prev} ${incoming}`
}

class ProxyAudioSource implements AudioSource {
  private listeners: Array<(pcm: Float32Array, sampleRate: number) => void> = []
  private pendingFrames: Array<{ pcm: Float32Array; sampleRate: number }> = []
  async start() {}
  stop() {}
  dispose() {
    this.listeners.length = 0
    this.pendingFrames.length = 0
  }
  onAudioData(cb: (pcm: Float32Array, sampleRate: number) => void) {
    this.listeners.push(cb)
    const pending = this.pendingFrames.splice(0)
    for (const frame of pending) cb(frame.pcm, frame.sampleRate)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }
  push(pcm: Float32Array, sampleRate: number) {
    if (this.listeners.length === 0) {
      this.pendingFrames.push({ pcm, sampleRate })
      if (this.pendingFrames.length > 80) this.pendingFrames.shift()
      return
    }
    for (const cb of this.listeners) cb(pcm, sampleRate)
  }
}

export class VoiceLayer {
  private config: VoiceLayerConfig
  private sttEngine: { start(): Promise<void>; stop(): void; abort(): void; dispose(): void } | null = null
  private router: VoiceNavRouter | null
  private _state: VoiceLayerState = 'idle'
  private aborted = false
  private finalTimer: ReturnType<typeof setTimeout> | null = null
  private pendingFinalTranscript = ''
  private interimTranscript = ''

  private alwaysOnSource: AudioSource | null = null
  private alwaysOnSourceUnsub: (() => void) | null = null
  private alwaysOnProxy: ProxyAudioSource | null = null
  private alwaysOnVad: { process(frame: Float32Array): { isSpeech: boolean; speechStarted: boolean; speechEnded: boolean; energy: number }; reset(): void } | null = null
  private alwaysOnActive = false
  private alwaysOnCooldown = false
  private alwaysOnFinalizeTimer: ReturnType<typeof setTimeout> | null = null
  private alwaysOnLatestTranscript = ''

  constructor(config: VoiceLayerConfig) {
    this.config = config
    this.router = config.nav
      ? new VoiceNavRouter(config.nav)
      : null
  }

  get currentState(): VoiceLayerState {
    return this._state
  }

  get isAlwaysOn(): boolean {
    return this.alwaysOnActive
  }

  async start(): Promise<void> {
    if (this.config.alwaysOn) {
      return this.startAlwaysOn()
    }
    return this.startOneShot()
  }

  private async startOneShot(): Promise<void> {
    if (this._state === 'listening') return
    this.aborted = false
    this.setState('listening')

    try {
      const { STTEngine } = await import('../stt/engine')

      const useGlassBridge = this.config.stt.source === 'glass-bridge'
        || (!this.config.stt.source && !!(globalThis as Record<string, unknown>).__evenBridge)

      const engine = new STTEngine({
        provider: this.config.stt.provider,
        source: useGlassBridge ? 'glass-bridge' : 'microphone',
        language: this.config.stt.language,
        apiKey: this.config.stt.apiKey,
        vad: { silenceMs: VOICE_FINAL_SILENCE_MS },
      })

      engine.onTranscript((t) => {
        const text = (t.text ?? '').replace(/\s+/g, ' ').trim()
        if (!text) return

        if (t.isFinal) {
          this.queueFinalTranscript(this.consumeFinalTranscript(text), (finalText) => this.handleFinalTranscript(finalText))
        } else {
          this.updateInterimTranscript(text)
        }
      })

      engine.onError(() => {
        this.clearFinalTimer(true)
        this.setState('error')
        this.sttEngine = null
      })

      await engine.start()
      this.sttEngine = engine
    } catch {
      this.clearFinalTimer(true)
      this.setState('error')
      this.sttEngine = null
    }
  }

  // ── Always-on VAD-gated mode ──

  private async startAlwaysOn(): Promise<void> {
    if (this.alwaysOnActive) return
    this.alwaysOnActive = true
    this.aborted = false

    try {
      const aoConfig: AlwaysOnConfig = typeof this.config.alwaysOn === 'object'
        ? this.config.alwaysOn
        : {}

      const { createVAD } = await import('../stt/audio/vad')
      this.alwaysOnVad = createVAD({
        silenceThresholdMs: aoConfig.silenceMs ?? VOICE_FINAL_SILENCE_MS,
        speechThresholdDb: aoConfig.thresholdDb ?? -26,
      })

      const useGlassBridge = this.config.stt.source === 'glass-bridge'
        || (!this.config.stt.source && !!(globalThis as Record<string, unknown>).__evenBridge)

      if (useGlassBridge) {
        const { GlassBridgeSource } = await import('../stt/sources/glass-bridge')
        this.alwaysOnSource = new GlassBridgeSource()
      } else {
        const { MicrophoneSource } = await import('../stt/sources/microphone')
        this.alwaysOnSource = new MicrophoneSource()
      }

      await this.alwaysOnSource.start()
      this.setState('monitoring')

      const cooldownMs = aoConfig.cooldownMs ?? 500

      this.alwaysOnSourceUnsub = this.alwaysOnSource.onAudioData((pcm, sampleRate) => {
        if (!this.alwaysOnActive || this.aborted) return

        const result = this.alwaysOnVad!.process(pcm)

        if (result.speechStarted && !this.alwaysOnCooldown && this._state === 'monitoring') {
          this.onAlwaysOnSpeechStart()
        }

        if (this.alwaysOnProxy && this._state === 'listening') {
          this.alwaysOnProxy.push(pcm, sampleRate)
        }

        if (result.speechEnded && this._state === 'listening') {
          this.onAlwaysOnSpeechEnd(cooldownMs)
        }
      })
    } catch (err) {
      this.stopAlwaysOn()
      this.setState('error')
      throw err
    }
  }

  private async onAlwaysOnSpeechStart(): Promise<void> {
    this.clearAlwaysOnFinalizeTimer()
    this.clearFinalTimer(true)
    this.alwaysOnLatestTranscript = ''
    this.alwaysOnProxy = new ProxyAudioSource()
    const proxy = this.alwaysOnProxy
    this.setState('listening')

    try {
      const { STTEngine } = await import('../stt/engine')

      const engine = new STTEngine({
        provider: this.config.stt.provider,
        source: proxy,
        language: this.config.stt.language,
        apiKey: this.config.stt.apiKey,
        continuous: true,
        vad: { silenceMs: VOICE_FINAL_SILENCE_MS },
      })

      engine.onTranscript((t) => {
        const text = (t.text ?? '').replace(/\s+/g, ' ').trim()
        if (!text) return
        if (t.isFinal) {
          this.alwaysOnLatestTranscript = ''
          this.queueFinalTranscript(this.consumeFinalTranscript(text), (finalText) => this.handleAlwaysOnTranscript(finalText))
        } else {
          this.alwaysOnLatestTranscript = this.updateInterimTranscript(text)
        }
      })

      engine.onError(() => {
        this.cleanupSttEngine()
        if (this.alwaysOnActive) this.setState('monitoring')
      })

      await engine.start()
      if (!this.alwaysOnActive || this.aborted || this.alwaysOnProxy !== proxy) {
        try { engine.abort() } catch { /* ignore */ }
        return
      }
      this.sttEngine = engine
    } catch {
      this.cleanupSttEngine()
      if (this.alwaysOnActive) this.setState('monitoring')
    }
  }

  private onAlwaysOnSpeechEnd(cooldownMs: number): void {
    this.clearAlwaysOnFinalizeTimer()
    if (this.sttEngine) {
      try { this.sttEngine.stop() } catch { /* ignore */ }
      this.sttEngine = null
    }
    this.alwaysOnProxy = null
    this.alwaysOnVad?.reset()

    this.alwaysOnCooldown = true
    setTimeout(() => { this.alwaysOnCooldown = false }, cooldownMs)
    this.scheduleAlwaysOnFinalizeFallback()
  }

  private async handleAlwaysOnTranscript(text: string): Promise<void> {
    this.clearAlwaysOnFinalizeTimer()
    this.alwaysOnLatestTranscript = ''
    if (this.sttEngine) {
      try { this.sttEngine.stop() } catch { /* ignore */ }
      this.sttEngine = null
    }
    this.alwaysOnProxy = null
    this.alwaysOnVad?.reset()

    await this.classifyAndAct(text)

    if (this.alwaysOnActive && !this.aborted) {
      this.setState('monitoring')
    }
  }

  private cleanupSttEngine(): void {
    this.clearAlwaysOnFinalizeTimer()
    this.clearFinalTimer(true)
    this.alwaysOnLatestTranscript = ''
    if (this.sttEngine) {
      try { this.sttEngine.abort() } catch { /* ignore */ }
      this.sttEngine = null
    }
    this.alwaysOnProxy = null
  }

  private stopAlwaysOn(): void {
    this.alwaysOnActive = false
    this.alwaysOnCooldown = false
    this.cleanupSttEngine()
    this.alwaysOnSourceUnsub?.()
    this.alwaysOnSourceUnsub = null
    this.alwaysOnSource?.stop()
    this.alwaysOnSource?.dispose()
    this.alwaysOnSource = null
    this.alwaysOnVad?.reset()
    this.alwaysOnVad = null
  }

  private scheduleAlwaysOnFinalizeFallback(): void {
    this.alwaysOnFinalizeTimer = setTimeout(() => {
      this.alwaysOnFinalizeTimer = null
      if (!this.alwaysOnActive || this.aborted || this._state !== 'listening') return
      if (this.finalTimer) return

      const text = this.alwaysOnLatestTranscript.trim()
      this.alwaysOnLatestTranscript = ''
      if (text) {
        void this.handleAlwaysOnTranscript(text)
      } else {
        this.setState('monitoring')
      }
    }, VOICE_FINAL_SILENCE_MS + 250)
  }

  private clearAlwaysOnFinalizeTimer(): void {
    if (!this.alwaysOnFinalizeTimer) return
    clearTimeout(this.alwaysOnFinalizeTimer)
    this.alwaysOnFinalizeTimer = null
  }

  stop(): void {
    this.clearFinalTimer(true)
    if (this.alwaysOnActive) {
      this.stopAlwaysOn()
      this.setState('idle')
      return
    }
    if (this.sttEngine) {
      try { this.sttEngine.stop() } catch { /* ignore */ }
      this.sttEngine = null
    }
    this.setState('idle')
  }

  async processText(text: string): Promise<VoiceIntent> {
    this.aborted = false
    return this.classifyAndAct(text)
  }

  abort(): void {
    this.aborted = true
    this.clearFinalTimer(true)
    if (this.alwaysOnActive) {
      this.stopAlwaysOn()
    }
    if (this.sttEngine) {
      try { this.sttEngine.abort() } catch { /* ignore */ }
      this.sttEngine = null
    }
    this.setState('idle')
  }

  dispose(): void {
    this.abort()
    this.router = null
  }

  updateNav(nav: VoiceLayerConfig['nav']): void {
    if (nav) {
      if (this.router) {
        this.router.updateRoutes(nav)
      } else {
        this.router = new VoiceNavRouter(nav)
      }
    } else {
      this.router = null
    }
    this.config = { ...this.config, nav }
  }

  private async handleFinalTranscript(text: string): Promise<void> {
    if (this.sttEngine) {
      try { this.sttEngine.stop() } catch { /* ignore */ }
      this.sttEngine = null
    }

    await this.classifyAndAct(text)
  }

  private queueFinalTranscript(text: string, onFinal: (text: string) => Promise<void>): void {
    this.pendingFinalTranscript = this.pendingFinalTranscript
      ? `${this.pendingFinalTranscript} ${text}`.trim()
      : text

    this.config.onTranscript?.(this.pendingFinalTranscript, false)
    this.clearFinalTimer()

    this.finalTimer = setTimeout(() => {
      this.finalTimer = null
      const finalText = this.pendingFinalTranscript.trim()
      this.pendingFinalTranscript = ''
      if (!finalText || this.aborted) return
      this.config.onTranscript?.(finalText, true)
      void onFinal(finalText)
    }, VOICE_FINAL_SILENCE_MS)
  }

  private clearFinalTimer(resetPending = false): void {
    if (this.finalTimer) {
      clearTimeout(this.finalTimer)
      this.finalTimer = null
    }
    if (resetPending) {
      this.pendingFinalTranscript = ''
      this.interimTranscript = ''
    }
  }

  private updateInterimTranscript(text: string): string {
    this.clearFinalTimer()
    this.interimTranscript = mergeTranscript(this.interimTranscript, text)
    const visibleText = joinTranscript(this.pendingFinalTranscript, this.interimTranscript)
    this.config.onTranscript?.(visibleText, false)
    return visibleText
  }

  private consumeFinalTranscript(text: string): string {
    const finalText = mergeTranscript(this.interimTranscript, text)
    this.interimTranscript = ''
    return finalText
  }

  private async classifyAndAct(text: string): Promise<VoiceIntent> {
    this.setState('processing')

    const routes = this.config.nav?.routes ?? []
    const actions = this.config.actions ?? []
    const threshold = this.config.localMatchThreshold ?? 0.7

    const intent = classifyLocally(text, routes, actions)

    if (this.aborted) return intent

    if (intent.type === 'navigate' && intent.confidence >= threshold && this.router) {
      this.setState('resolving')
      if (this.aborted) return intent

      const success = await this.router.resolveAndNavigate(intent)
      if (this.aborted) return intent

      if (success) {
        this.setState('navigating')
        setTimeout(() => {
          if (this._state === 'navigating') {
            this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
          }
        }, 500)
        return intent
      }

      if (this.config.render) {
        return this.handleRender(text, intent)
      }

      this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
      return intent
    }

    if (intent.type === 'action' && intent.action) {
      return this.handleAction(text, intent)
    }

    if (intent.type === 'render' && this.config.render) {
      return this.handleRender(text, intent)
    }

    if (intent.type === 'unknown' && this.config.render) {
      return this.handleRender(text, { ...intent, type: 'render' })
    }

    this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
    return intent
  }

  private async handleAction(text: string, intent: VoiceIntent): Promise<VoiceIntent> {
    if (!intent.action) {
      this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
      return intent
    }

    this.setState('executing')
    if (this.aborted) return intent

    const entityText = intent.entityText ?? text
    const params = await extractActionParams(entityText, intent.action)
    if (this.aborted) return intent

    const ctx: ActionContext = {
      currentScreen: '',
      currentPath: '',
      language: this.config.stt.language ?? 'en',
    }

    try {
      const result = await intent.action.handler(params, ctx)

      if (result.display) {
        this.config.render?.onDisplayState(result.display)
      } else if (result.message) {
        this.config.render?.onDisplayState({ mode: 'text', title: 'DONE', body: result.message })
      }

      const finalIntent: VoiceIntent = {
        ...intent,
        actionParams: params,
        transcript: text,
      }

      this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
      return finalIntent
    } catch {
      this.setState('error')
      setTimeout(() => {
        if (this._state === 'error') {
          this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
        }
      }, 1000)
      return intent
    }
  }

  private async handleRender(text: string, intent: VoiceIntent): Promise<VoiceIntent> {
    this.setState('rendering')
    const renderIntent: VoiceIntent = { ...intent, type: 'render', transcript: text }
    this.config.render?.onDisplayState({ mode: 'text', title: 'VOICE', body: text })
    this.setState(this.alwaysOnActive ? 'monitoring' : 'idle')
    return renderIntent
  }

  private setState(state: VoiceLayerState): void {
    if (this._state === state) return
    this._state = state
    this.config.onStateChange?.(state)
  }
}
