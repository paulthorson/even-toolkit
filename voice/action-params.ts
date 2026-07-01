import type { VoiceAction, EntityResolver, TextParamConfig } from './types'
import { isEntityResolver } from './types'
import { stringSimilarity } from './intent-classifier'

/**
 * Extract and resolve parameters from spoken text for a VoiceAction.
 *
 * Handles two param types:
 * - EntityResolver: fuzzy-match against live data (contacts, recipes, etc.)
 * - TextParamConfig: extract free-form text via keyword splitting or remainder
 */
export async function extractActionParams(
  spoken: string,
  action: VoiceAction,
): Promise<Record<string, string>> {
  const params = action.params ?? {}
  const paramNames = Object.keys(params)
  if (paramNames.length === 0) return {}

  const result: Record<string, string> = {}
  let remaining = spoken

  // Pass 1: extract after-keyword text params (most specific, anchored by keyword)
  for (const name of paramNames) {
    const config = params[name]
    if (isEntityResolver(config)) continue
    const textConfig = config as TextParamConfig
    if (textConfig.extraction !== 'after-keyword' || !textConfig.keyword) continue

    const kwLower = textConfig.keyword.toLowerCase()
    const idx = remaining.toLowerCase().indexOf(kwLower)
    if (idx >= 0) {
      const after = remaining.slice(idx + kwLower.length).trim()
      if (after) {
        result[name] = after
        remaining = remaining.slice(0, idx).trim()
      }
    }
  }

  // Pass 2: extract quoted text params
  for (const name of paramNames) {
    if (result[name]) continue
    const config = params[name]
    if (isEntityResolver(config)) continue
    const textConfig = config as TextParamConfig
    if (textConfig.extraction !== 'quoted') continue

    const quoteMatch = remaining.match(/"([^"]+)"/) ?? remaining.match(/'([^']+)'/)
    if (quoteMatch?.[1]) {
      result[name] = quoteMatch[1]
      remaining = remaining.replace(quoteMatch[0], '').trim()
    }
  }

  // Pass 3: resolve entity params against remaining text
  for (const name of paramNames) {
    if (result[name]) continue
    const config = params[name]
    if (!isEntityResolver(config)) continue
    const resolver = config as EntityResolver

    const resolved = await resolver.resolve(remaining)
    if (resolved !== null) {
      result[name] = resolved
      continue
    }

    // Try list() fallback with fuzzy matching
    if (resolver.list) {
      const candidates = await resolver.list()
      const match = fuzzyEntitySearch(remaining, candidates)
      if (match) {
        result[name] = match
        continue
      }
    }
  }

  // Pass 4: remainder params — take whatever's left
  for (const name of paramNames) {
    if (result[name]) continue
    const config = params[name]
    if (isEntityResolver(config)) continue
    const textConfig = config as TextParamConfig
    if (textConfig.extraction !== 'remainder') continue

    if (remaining) {
      result[name] = remaining
    }
  }

  return result
}

function fuzzyEntitySearch(
  spoken: string,
  candidates: { id: string; label: string; aliases?: string[] }[],
): string | null {
  const norm = spoken.toLowerCase().trim()
  if (!norm || candidates.length === 0) return null

  let bestId: string | null = null
  let bestScore = 0

  for (const c of candidates) {
    const names = [c.label, ...(c.aliases ?? [])]
    for (const name of names) {
      const nameNorm = name.toLowerCase()

      if (nameNorm === norm) return c.id

      if (norm.includes(nameNorm) || nameNorm.includes(norm)) {
        const score = Math.min(norm.length, nameNorm.length) / Math.max(norm.length, nameNorm.length)
        if (score > bestScore) {
          bestScore = score
          bestId = c.id
        }
        continue
      }

      const similarity = stringSimilarity(norm, nameNorm)
      if (similarity > bestScore) {
        bestScore = similarity
        bestId = c.id
      }
    }
  }

  return bestScore >= 0.7 ? bestId : null
}
