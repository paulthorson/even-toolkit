export * from './types'
export { VoiceLayer } from './voice-layer'
export { VoiceNavRouter, findBestEntityMatch } from './voice-router'
export { classifyLocally, findBestRouteMatch, findBestActionMatch, stringSimilarity } from './intent-classifier'
export { buildVoiceFeedbackDisplay, buildActionResultDisplay } from './voice-feedback'
export { createListResolver } from './list-resolver'
export { extractActionParams } from './action-params'

/** Convenience: type-checks the route array and returns it as-is. */
export function defineVoiceRoutes(routes: import('./types').VoiceRoute[]): import('./types').VoiceRoute[] {
  return routes
}

/** Convenience: type-checks the action array and returns it as-is. */
export function defineVoiceActions(actions: import('./types').VoiceAction[]): import('./types').VoiceAction[] {
  return actions
}
