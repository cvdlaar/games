export type GameStatus = 'setup' | 'active' | 'ended'
export type LocationType = 'tower' | 'market' | 'barracks' | 'outpost' | 'mine' | 'checkpoint' | 'base'
export type ChallengeType = 'quiz' | 'photo' | 'puzzle' | 'timed' | 'checkin'
export type EncounterChoice = 'attack' | 'defend' | 'trade' | 'dodge'
export type EncounterStatus = 'pending' | 'resolved' | 'expired'

export interface Game {
  id: string
  code: string
  name: string
  status: GameStatus
  host_token: string
  config: GameConfig
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface GameConfig {
  play_area?: {
    lat: number
    lng: number
    radius_km: number
  }
  duration_minutes?: number
  crown_tick_interval_minutes?: number
  encounter_radius_meters?: number
  max_players?: number
}

export interface Location {
  id: string
  game_id: string
  name: string
  description: string
  lat: number
  lng: number
  type: LocationType
  challenge_type: ChallengeType
  challenge_data: ChallengeData
  claim_radius: number
  crown_value: number
  created_at: string
}

export interface ChallengeData {
  question?: string
  answer?: string
  options?: string[]
  time_limit_seconds?: number
  photo_prompt?: string
  puzzle_pieces?: string[]
}

export interface Player {
  id: string
  game_id: string
  name: string
  color: string
  token: string
  alliance_id: string | null
  crowns: number
  lat: number | null
  lng: number | null
  last_seen: string | null
  is_active: boolean
  created_at: string
}

export interface LocationOwnership {
  id: string
  location_id: string
  player_id: string
  defense_level: number
  claimed_at: string
  player?: Player
  location?: Location
}

export interface Encounter {
  id: string
  game_id: string
  initiator_id: string
  target_id: string
  initiator_choice: EncounterChoice | null
  target_choice: EncounterChoice | null
  winner_id: string | null
  status: EncounterStatus
  expires_at: string
  created_at: string
  initiator?: Player
  target?: Player
}

export interface Alliance {
  id: string
  game_id: string
  name: string
  color: string
  created_at: string
}

export interface GameEvent {
  id: string
  game_id: string
  type: string
  player_id: string | null
  data: Record<string, unknown>
  created_at: string
}

export const LOCATION_TYPE_CONFIG: Record<LocationType, {
  label: string
  emoji: string
  description: string
  crownValue: number
  color: string
  ability: string
}> = {
  tower: {
    label: 'Toren',
    emoji: '🏰',
    description: 'Zie alle spelers in 500m radius',
    crownValue: 8,
    color: '#6366f1',
    ability: 'intel',
  },
  market: {
    label: 'Markt',
    emoji: '🏪',
    description: 'Hoge opbrengst, neutraal terrein',
    crownValue: 20,
    color: '#f59e0b',
    ability: 'trade',
  },
  barracks: {
    label: 'Kazerne',
    emoji: '⚔️',
    description: 'Beschermt aangrenzende locaties',
    crownValue: 5,
    color: '#ef4444',
    ability: 'shield',
  },
  outpost: {
    label: 'Observatiepost',
    emoji: '👁️',
    description: 'Waarschuwing als vijand nadert',
    crownValue: 6,
    color: '#8b5cf6',
    ability: 'warning',
  },
  mine: {
    label: 'Mijn',
    emoji: '⛏️',
    description: 'Veel kronen maar kwetsbaar',
    crownValue: 25,
    color: '#64748b',
    ability: 'production',
  },
  checkpoint: {
    label: 'Checkpoint',
    emoji: '🚩',
    description: 'Route-bonus bij twee checkpoints',
    crownValue: 10,
    color: '#10b981',
    ability: 'route',
  },
  base: {
    label: 'Basiskamp',
    emoji: '🏕️',
    description: 'Startlocatie, altijd veilig',
    crownValue: 3,
    color: '#3b82f6',
    ability: 'respawn',
  },
}

export const ENCOUNTER_MATRIX: Record<EncounterChoice, Record<EncounterChoice, 'win' | 'lose' | 'draw'>> = {
  attack:  { attack: 'draw', defend: 'lose', trade: 'draw', dodge: 'win' },
  defend:  { attack: 'win',  defend: 'draw', trade: 'draw', dodge: 'draw' },
  trade:   { attack: 'draw', defend: 'draw', trade: 'draw', dodge: 'draw' },
  dodge:   { attack: 'lose', defend: 'draw', trade: 'draw', dodge: 'draw' },
}
