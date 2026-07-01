import type { VoiceNavConfig, VoiceIntent, EntityCandidate } from './types'
import { stringSimilarity } from './intent-classifier'

export class VoiceNavRouter {
  private config: VoiceNavConfig

  constructor(config: VoiceNavConfig) {
    this.config = config
  }

  /** Resolve entity parameters and navigate. Returns true on success. */
  async resolveAndNavigate(intent: VoiceIntent): Promise<boolean> {
    if (!intent.route) return false

    let path = intent.route.pattern
    const params = intent.route.params ?? {}
    const paramNames = Object.keys(params)

    // No params to resolve — navigate directly
    if (paramNames.length === 0) {
      this.config.navigate(path)
      return true
    }

    // Resolve each :param in the URL pattern
    for (const paramName of paramNames) {
      const resolver = params[paramName]
      if (!resolver) continue

      const spoken = intent.entityText ?? intent.transcript ?? ''
      const resolved = await resolver.resolve(spoken)

      if (resolved !== null) {
        path = path.replace(`:${paramName}`, encodeURIComponent(resolved))
        continue
      }

      // Resolver returned null — try disambiguation via list()
      if (resolver.list) {
        const candidates = await resolver.list()
        const fuzzyMatch = findBestEntityMatch(spoken, candidates)
        if (fuzzyMatch) {
          path = path.replace(`:${paramName}`, encodeURIComponent(fuzzyMatch.id))
          continue
        }
      }

      return false
    }

    this.config.navigate(path)
    return true
  }

  /** Update routes at runtime (e.g., when app data changes). */
  updateRoutes(config: VoiceNavConfig): void {
    this.config = config
  }
}

/** Find the best fuzzy match from a list of entity candidates. */
export function findBestEntityMatch(
  spoken: string,
  candidates: EntityCandidate[],
  threshold = 0.7,
): EntityCandidate | null {
  const norm = spoken.toLowerCase().trim()
  if (!norm || candidates.length === 0) return null

  let best: { candidate: EntityCandidate; score: number } | null = null

  for (const candidate of candidates) {
    const names = [candidate.label, ...(candidate.aliases ?? [])]

    for (const name of names) {
      const nameNorm = name.toLowerCase()

      // Exact match
      if (norm === nameNorm) return candidate

      // Contains match: "pasta carbonara" contains "carbonara"
      if (norm.includes(nameNorm) || nameNorm.includes(norm)) {
        const score = Math.min(norm.length, nameNorm.length) / Math.max(norm.length, nameNorm.length)
        if (score >= threshold && (!best || score > best.score)) {
          best = { candidate, score }
        }
        continue
      }

      // Fuzzy similarity
      const similarity = stringSimilarity(norm, nameNorm)
      if (similarity >= threshold && (!best || similarity > best.score)) {
        best = { candidate, score: similarity }
      }
    }
  }

  return best?.candidate ?? null
}
