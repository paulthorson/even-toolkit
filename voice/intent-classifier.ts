import type { VoiceRoute, VoiceAction, VoiceIntent } from './types'

const NAV_PREFIXES = [
  'go to', 'open', 'navigate to', 'switch to', 'take me to',
  'vai a', 'apri', 'mostrami', 'passa a', 'portami a',
]

const RENDER_PREFIXES = [
  'what is', 'what are', 'tell me', 'explain',
  'how to', 'search for', 'look up', "what's",
  'show me a chart', 'display',
  "cos'è", 'dimmi', 'cerca', 'spiega',
]

const ACTION_PREFIXES = [
  'send', 'add', 'create', 'delete', 'remove', 'start', 'stop',
  'set', 'mark', 'toggle', 'play', 'pause', 'skip', 'mute',
  'unmute', 'save', 'share', 'cancel', 'confirm', 'dismiss',
  'invia', 'aggiungi', 'crea', 'elimina', 'rimuovi', 'avvia', 'ferma',
]

// "show me" is ambiguous — could be nav ("show me settings") or render ("show me a chart of sales").
// We try nav first; if no route match, classify as render.
const AMBIGUOUS_NAV_PREFIXES = ['show me', 'show']

interface RouteMatch {
  route: VoiceRoute
  score: number
  entityText?: string
}

interface ActionMatch {
  action: VoiceAction
  score: number
  remainderText: string
}

export function classifyLocally(
  transcript: string,
  routes: VoiceRoute[],
  actions?: VoiceAction[],
): VoiceIntent {
  const normalized = transcript.toLowerCase().trim()
  if (!normalized) return { type: 'unknown', confidence: 0, transcript }

  // 1. Check nav prefixes + route name/alias match
  for (const prefix of NAV_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue
    const remainder = normalized.slice(prefix.length).trim()
    if (!remainder) continue
    const match = findBestRouteMatch(remainder, routes)
    if (match && match.score >= 0.7) {
      return {
        type: 'navigate',
        confidence: match.score,
        route: match.route,
        entityText: match.entityText,
        transcript,
      }
    }
  }

  // 2. Ambiguous prefixes — try nav, fallback to render
  for (const prefix of AMBIGUOUS_NAV_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue
    const remainder = normalized.slice(prefix.length).trim()
    if (!remainder) continue
    const match = findBestRouteMatch(remainder, routes)
    if (match && match.score >= 0.7) {
      return {
        type: 'navigate',
        confidence: match.score,
        route: match.route,
        entityText: match.entityText,
        transcript,
      }
    }
    return { type: 'render', confidence: 0.8, transcript }
  }

  // 3. Action prefixes + action name/alias match
  if (actions?.length) {
    for (const prefix of ACTION_PREFIXES) {
      if (!normalized.startsWith(prefix)) continue
      const remainder = normalized.slice(prefix.length).trim()
      if (!remainder) continue
      const match = findBestActionMatch(prefix + ' ' + remainder, actions)
      if (match && match.score >= 0.7) {
        return {
          type: 'action',
          confidence: match.score,
          action: match.action,
          entityText: match.remainderText,
          transcript,
        }
      }
    }

    // 3b. Direct action name/alias match (no prefix)
    const directAction = findBestActionMatch(normalized, actions)
    if (directAction && directAction.score >= 0.85) {
      return {
        type: 'action',
        confidence: directAction.score * 0.9,
        action: directAction.action,
        entityText: directAction.remainderText,
        transcript,
      }
    }
  }

  // 4. Render prefixes
  for (const prefix of RENDER_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return { type: 'render', confidence: 0.8, transcript }
    }
  }

  // 5. Direct route name match (no prefix): "settings", "recipes"
  const directMatch = findBestRouteMatch(normalized, routes)
  if (directMatch && directMatch.score >= 0.85) {
    return {
      type: 'navigate',
      confidence: directMatch.score * 0.9,
      route: directMatch.route,
      entityText: directMatch.entityText,
      transcript,
    }
  }

  // 6. Unknown — needs LLM or falls through
  return { type: 'unknown', confidence: 0, transcript }
}

/** Find the best action match from registered voice actions. */
export function findBestActionMatch(
  spoken: string,
  actions: VoiceAction[],
): ActionMatch | null {
  const norm = spoken.toLowerCase().trim()
  if (!norm || actions.length === 0) return null

  let best: ActionMatch | null = null

  for (const action of actions) {
    const candidates = [action.name.toLowerCase(), ...(action.aliases ?? []).map(a => a.toLowerCase())]

    for (const candidate of candidates) {
      // Exact match
      if (norm === candidate) {
        return { action, score: 1.0, remainderText: '' }
      }

      // Starts-with: "send message to Alessio saying hi" starts with "send message"
      if (norm.startsWith(candidate + ' ')) {
        const remainderText = norm.slice(candidate.length).trim()
        const score = candidate.length / norm.length
        if (!best || score > best.score) {
          best = { action, score: Math.max(score, 0.75), remainderText }
        }
        continue
      }

      // Starts-with with "to/a" connector: "send message to X" or "add to shopping list"
      if (norm.startsWith(candidate + ' to ') || norm.startsWith(candidate + ' a ')) {
        const connectorLen = norm.startsWith(candidate + ' to ') ? 4 : 3
        const remainderText = norm.slice(candidate.length + connectorLen).trim()
        if (!best || 0.85 > best.score) {
          best = { action, score: 0.85, remainderText }
        }
        continue
      }

      // Fuzzy similarity
      const similarity = stringSimilarity(norm, candidate)
      if (similarity > 0.75 && (!best || similarity > best.score)) {
        best = { action, score: similarity, remainderText: '' }
      }
    }
  }

  return best
}

export function findBestRouteMatch(
  spoken: string,
  routes: VoiceRoute[],
): RouteMatch | null {
  const norm = spoken.toLowerCase().trim()
  if (!norm) return null

  let best: RouteMatch | null = null

  for (const route of routes) {
    const candidates = [route.name.toLowerCase(), ...(route.aliases ?? []).map(a => a.toLowerCase())]

    for (const candidate of candidates) {
      // Exact match
      if (norm === candidate) {
        return { route, score: 1.0 }
      }

      // "the <candidate>" — spoken form includes article
      if (norm === `the ${candidate}` || norm === `la ${candidate}` || norm === `il ${candidate}`) {
        return { route, score: 0.98 }
      }

      // Starts-with: "pasta recipes" when route name is "recipes"
      if (norm.startsWith(candidate + ' ')) {
        const entityText = norm.slice(candidate.length).trim()
        const score = candidate.length / norm.length
        if (!best || score > best.score) {
          best = { route, score: Math.max(score, 0.7), entityText }
        }
        continue
      }

      // Ends-with: "Alessio chat" when route name is "chat"
      if (norm.endsWith(' ' + candidate)) {
        const entityText = norm.slice(0, -(candidate.length + 1)).trim()
        const score = candidate.length / norm.length
        if (!best || score > best.score) {
          best = { route, score: Math.max(score, 0.7), entityText }
        }
        continue
      }

      // Contains pattern: "chat with Alessio" when route name is "chat"
      const withIdx = norm.indexOf(candidate + ' with ')
      if (withIdx === 0) {
        const entityText = norm.slice(candidate.length + 6).trim()
        if (entityText && (!best || 0.9 > best.score)) {
          best = { route, score: 0.9, entityText }
        }
        continue
      }

      // Fuzzy similarity
      const similarity = stringSimilarity(norm, candidate)
      if (similarity > 0.75 && (!best || similarity > best.score)) {
        best = { route, score: similarity }
      }
    }
  }

  return best
}

/** Normalized Levenshtein distance as similarity score (0–1). */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const la = a.length
  const lb = b.length
  if (la === 0 || lb === 0) return 0

  // Short-circuit for very different lengths
  const maxLen = Math.max(la, lb)
  if (Math.abs(la - lb) / maxLen > 0.5) return 0

  const prev = new Array<number>(lb + 1)
  const curr = new Array<number>(lb + 1)

  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      )
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j]
  }

  return 1 - prev[lb] / maxLen
}
