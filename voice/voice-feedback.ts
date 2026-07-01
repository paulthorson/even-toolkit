import type { DisplayData } from '../glasses/types'
import { line, glassHeader } from '../glasses/types'
import type { VoiceLayerState, ActionResult } from './types'

/** Build a glasses DisplayData for the current voice interaction state. */
export function buildVoiceFeedbackDisplay(opts: {
  state: VoiceLayerState
  transcript: string
  targetScreen?: string
  actionName?: string
}): DisplayData {
  const { state, transcript, targetScreen, actionName } = opts
  const lines = [...glassHeader('VOICE')]

  switch (state) {
    case 'monitoring':
      lines.push(line('Voice ready', 'meta'))
      break
    case 'listening':
      lines.push(line('Listening...', 'meta'))
      if (transcript) {
        lines.push(line(''))
        for (const l of wordWrapSimple(transcript, 38)) {
          lines.push(line(l))
        }
      }
      break
    case 'processing':
      lines.push(line('Processing...', 'meta'))
      if (transcript) {
        lines.push(line(''))
        lines.push(line(truncate(transcript, 38)))
      }
      break
    case 'resolving':
      lines.push(line('Resolving...', 'meta'))
      if (transcript) {
        lines.push(line(''))
        lines.push(line(truncate(transcript, 38)))
      }
      break
    case 'navigating':
      if (targetScreen) {
        lines.push(line(`Going to ${targetScreen}...`, 'meta'))
      } else {
        lines.push(line('Navigating...', 'meta'))
      }
      break
    case 'executing':
      if (actionName) {
        lines.push(line(`Running ${truncate(actionName, 30)}...`, 'meta'))
      } else {
        lines.push(line('Executing...', 'meta'))
      }
      if (transcript) {
        lines.push(line(''))
        lines.push(line(truncate(transcript, 38)))
      }
      break
    case 'rendering':
      lines.push(line('Thinking...', 'meta'))
      if (transcript) {
        lines.push(line(''))
        lines.push(line(truncate(transcript, 38)))
      }
      break
    case 'error':
      lines.push(line('Voice error', 'meta'))
      break
    default:
      break
  }

  return { lines }
}

/** Build a glasses DisplayData showing the result of a voice action. */
export function buildActionResultDisplay(result: ActionResult): DisplayData {
  const lines = [...glassHeader('VOICE')]
  if (result.success) {
    lines.push(line(result.message ?? 'Done', 'meta'))
  } else {
    lines.push(line(result.message ?? 'Failed', 'meta'))
  }
  return { lines }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

function wordWrapSimple(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}
