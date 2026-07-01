import type { EntityResolver, EntityCandidate } from './types'
import { stringSimilarity } from './intent-classifier'

interface ListResolverOptions<T> {
  entityType: string
  getItems(): T[]
  getId(item: T): string
  getLabel(item: T): string
  getAliases?(item: T): string[]
}

/**
 * Factory for creating EntityResolvers that match spoken names against a live
 * list of app data (recipes, contacts, workouts, etc.) using fuzzy matching.
 */
export function createListResolver<T>(opts: ListResolverOptions<T>): EntityResolver {
  return {
    entityType: opts.entityType,

    resolve(spoken: string): string | null {
      const items = opts.getItems()
      const normalized = spoken.toLowerCase().trim()
      if (!normalized) return null

      let bestId: string | null = null
      let bestScore = 0

      for (const item of items) {
        const names = [opts.getLabel(item), ...(opts.getAliases?.(item) ?? [])]

        for (const name of names) {
          const nameNorm = name.toLowerCase()

          // Exact match — return immediately
          if (nameNorm === normalized) return opts.getId(item)

          // Contains: "pasta carbonara" spoken, "carbonara" label or vice versa
          if (normalized.includes(nameNorm) || nameNorm.includes(normalized)) {
            const score = Math.min(normalized.length, nameNorm.length) / Math.max(normalized.length, nameNorm.length)
            if (score > bestScore) {
              bestScore = score
              bestId = opts.getId(item)
            }
            continue
          }

          // Fuzzy
          const similarity = stringSimilarity(normalized, nameNorm)
          if (similarity > bestScore) {
            bestScore = similarity
            bestId = opts.getId(item)
          }
        }
      }

      return bestScore >= 0.7 ? bestId : null
    },

    list(): EntityCandidate[] {
      return opts.getItems().map(item => ({
        id: opts.getId(item),
        label: opts.getLabel(item),
        aliases: opts.getAliases?.(item),
      }))
    },
  }
}
