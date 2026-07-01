// ── Voice Route Registration ──

export interface VoiceRoute {
  /** URL pattern this voice command navigates to. Supports :param placeholders. */
  pattern: string
  /** Human-readable screen name, used for matching ("recipes", "settings") */
  name: string
  /** Synonyms and trigger phrases: ["cookbook", "my recipes", "recipe list"] */
  aliases?: string[]
  /** Natural-language description for LLM matching */
  description?: string
  /** Parameter resolvers for dynamic segments (:id, :slug, etc.) */
  params?: Record<string, EntityResolver>
  /** If set, this route can only be reached by voice from specific parent screens */
  requiredContext?: string[]
}

// ── Entity Resolution ──

export interface EntityResolver {
  /** Type label for LLM context: "contact", "recipe", "stock" */
  entityType: string
  /** Resolve a spoken entity name to a route parameter value.
   *  Return null if the entity cannot be found. */
  resolve(spoken: string, context?: ResolverContext): Promise<string | null> | string | null
  /** Optional: list available entities for disambiguation.
   *  Return an array of {id, label} for fuzzy matching or LLM to pick from. */
  list?(): Promise<EntityCandidate[]> | EntityCandidate[]
}

export interface EntityCandidate {
  id: string
  label: string
  aliases?: string[]
}

export interface ResolverContext {
  currentScreen: string
  currentPath: string
  language: string
}

// ── Voice Actions ──

export interface VoiceAction {
  /** Action identifier: "send_message", "add_to_cart", etc. */
  name: string
  /** Human-readable description for LLM matching */
  description: string
  /** Trigger phrases/verbs: ["send message", "text", "write to"] */
  aliases?: string[]
  /** Parameter resolvers for dynamic values */
  params?: Record<string, EntityResolver | TextParamConfig>
  /** Execute the action. Return result for glass feedback. */
  handler(params: Record<string, string>, context?: ActionContext): Promise<ActionResult> | ActionResult
}

export interface TextParamConfig {
  /** Type label */
  entityType: string
  /** How to extract this param from speech:
   *  - 'remainder': takes everything after entities are extracted
   *  - 'quoted': extracts text within quotes
   *  - 'after-keyword': splits on keyword and takes everything after */
  extraction: 'remainder' | 'quoted' | 'after-keyword'
  /** Keyword that precedes this param, e.g. "saying" in "send message to X saying Y" */
  keyword?: string
}

export interface ActionContext {
  currentScreen: string
  currentPath: string
  language: string
}

export interface ActionResult {
  success: boolean
  /** Feedback message shown on glasses */
  message?: string
  /** Optional display state to show after action */
  display?: VoiceDisplayState
}

/** Type guard: distinguishes EntityResolver from TextParamConfig */
export function isEntityResolver(p: EntityResolver | TextParamConfig): p is EntityResolver {
  return typeof (p as EntityResolver).resolve === 'function'
}

// ── Intent Classification ──

export type VoiceIntentType = 'navigate' | 'render' | 'action' | 'unknown'

export interface VoiceIntent {
  type: VoiceIntentType
  confidence: number
  /** For 'navigate': the matched VoiceRoute */
  route?: VoiceRoute
  /** For 'navigate': resolved URL path */
  resolvedPath?: string
  /** For 'navigate': extracted entity values */
  entities?: Record<string, string>
  /** For 'navigate': remaining text after route match (raw entity input) */
  entityText?: string
  /** For 'render': the original transcript to send to LLM */
  transcript?: string
  /** For 'action': the matched VoiceAction */
  action?: VoiceAction
  /** For 'action': resolved parameter values */
  actionParams?: Record<string, string>
}

// ── Voice Layer Configuration ──

export interface VoiceNavConfig {
  /** Registered routes that can be reached by voice */
  routes: VoiceRoute[]
  /** Navigation callback - typically React Router's navigate() */
  navigate(path: string): void
}

export interface VoiceRenderConfig {
  /** LLM provider: 'openrouter' | 'openai' | 'anthropic' | 'google' */
  llmProvider: string
  /** LLM model identifier */
  llmModel: string
  /** API key for the LLM */
  llmApiKey: string
  /** Additional system prompt context (app-specific) */
  systemContext?: string
  /** Callback when display state changes (from tool calls) */
  onDisplayState(state: VoiceDisplayState): void
}

export interface AlwaysOnConfig {
  /** VAD silence timeout before ending a speech segment (ms, default: 2000) */
  silenceMs?: number
  /** VAD energy threshold in dB (default: -26) */
  thresholdDb?: number
  /** Cooldown between speech segments to avoid rapid re-triggers (ms, default: 500) */
  cooldownMs?: number
}

export interface VoiceLayerConfig {
  /** STT configuration */
  stt: {
    provider: string
    apiKey: string
    language?: string
    source?: 'microphone' | 'glass-bridge'
  }
  /** Voice navigation config (optional - omit to disable voice nav) */
  nav?: VoiceNavConfig
  /** Voice render config (optional - omit to disable voice render) */
  render?: VoiceRenderConfig
  /** Voice actions (optional - functions callable by voice without navigation) */
  actions?: VoiceAction[]
  /** Minimum confidence threshold for local pattern matching (default: 0.7) */
  localMatchThreshold?: number
  /** Callback for voice state changes (listening, processing, etc.) */
  onStateChange?(state: VoiceLayerState): void
  /** Callback for interim transcripts (for live display on glasses) */
  onTranscript?(text: string, isFinal: boolean): void
  /** Always-on mode: mic stays open, local VAD gates STT activation.
   *  Zero cost during silence — STT provider only runs during speech. */
  alwaysOn?: boolean | AlwaysOnConfig
}

// ── Voice Layer State ──

export type VoiceLayerState =
  | 'idle'
  | 'monitoring'
  | 'listening'
  | 'processing'
  | 'resolving'
  | 'rendering'
  | 'navigating'
  | 'executing'
  | 'error'

// ── Display State (reusable across all apps) ──

export type VoiceDisplayMode =
  | 'text' | 'list' | 'table' | 'detail'
  | 'chart' | 'dashboard' | 'canvas' | 'image'

export interface VoiceDisplayState {
  mode: VoiceDisplayMode
  title?: string
  body?: string
  items?: { label: string; detail?: string }[]
  columns?: { header: string; values: string[]; align?: 'left' | 'right' }[]
  header?: string
  panes?: { content: string; width?: number }[]
  chart?: {
    type: 'bar' | 'line' | 'sparkline' | 'progress'
    data: { label: string; value: number }[]
    caption?: string
  }
  metrics?: { label: string; value: string }[]
  canvasInstructions?: unknown[]
  imageUrl?: string
}
