import { EncounterChoice, ENCOUNTER_MATRIX } from './types'

export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function resolveEncounter(choice1: EncounterChoice, choice2: EncounterChoice): {
  result1: 'win' | 'lose' | 'draw'
  result2: 'win' | 'lose' | 'draw'
} {
  const result1 = ENCOUNTER_MATRIX[choice1][choice2]
  const result2 = result1 === 'win' ? 'lose' : result1 === 'lose' ? 'win' : 'draw'
  return { result1, result2 }
}

export function calculateEncounterReward(result: 'win' | 'lose' | 'draw', choice: EncounterChoice): number {
  if (choice === 'trade') return 15
  if (result === 'win') return 30
  if (result === 'lose') return -20
  return 0
}

export const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f43f5e', '#84cc16', '#6366f1',
]
