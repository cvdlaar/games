export type GameStatus = 'setup' | 'active' | 'ended'
export type LocationType = 'tower' | 'market' | 'barracks' | 'outpost' | 'mine' | 'checkpoint' | 'base'
export type ChallengeType = 'quiz' | 'photo' | 'puzzle' | 'timed' | 'checkin'
export type EncounterChoice = 'attack' | 'defend' | 'trade' | 'dodge'
export type EncounterStatus = 'pending' | 'resolved' | 'expired'
export type StrategyType = 'veroveraar' | 'verdediger' | 'handelaar' | 'spion'

export const STRATEGY_PRESETS: Record<StrategyType, {
  label: string
  emoji: string
  color: string
  tagline: string
  bonus: string
}> = {
  veroveraar: {
    label: 'Veroveraar',
    emoji: '⚔️',
    color: '#ef4444',
    tagline: 'Veroveren & uitbreiden',
    bonus: '+10 kronen bij elke verovering',
  },
  verdediger: {
    label: 'Verdediger',
    emoji: '🛡️',
    color: '#3b82f6',
    tagline: 'Beschermen & standhouden',
    bonus: 'Nieuw ingenomen post start op verdediging niveau 1',
  },
  handelaar: {
    label: 'Handelaar',
    emoji: '◈',
    color: '#f59e0b',
    tagline: 'Slim onderhandelen',
    bonus: 'Handelsencounters geven +30 kronen (standaard +15)',
  },
  spion: {
    label: 'Spion',
    emoji: '👁️',
    color: '#8b5cf6',
    tagline: 'Intel & verrassingaanvallen',
    bonus: 'Vijanden zichtbaar op 300m (standaard 150m)',
  },
}

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

export interface GamePhase {
  name: string
  duration_minutes: number
  zone_factor: number        // 1.0 = volledig gebied, 0.5 = helft, etc.
  crown_penalty_per_tick: number  // kronen verlies per tick buiten de zone
}

export const DEFAULT_PHASES: GamePhase[] = [
  { name: 'Verkenning',  duration_minutes: 20, zone_factor: 1.0, crown_penalty_per_tick: 0  },
  { name: 'Inkrimping',  duration_minutes: 15, zone_factor: 0.55, crown_penalty_per_tick: 10 },
  { name: 'Eindstrijd',  duration_minutes: 10, zone_factor: 0.25, crown_penalty_per_tick: 25 },
]

export interface StoryChapter {
  id: string
  title: string
  content: string
  trigger: 'game_start' | 'game_end' | 'manual'
}

export interface NarratorPreset {
  id: string
  name: string
  emoji: string
  color: string
  tagline: string
  variant: string
  defaultChapters: StoryChapter[]
}

export const NARRATOR_PRESETS: NarratorPreset[] = [
  {
    id: 'scout',
    name: 'De Verkenner',
    emoji: '🧭',
    color: '#8b5cf6',
    tagline: 'Ken het terrein',
    variant: 'Verkenning & verovering',
    defaultChapters: [
      {
        id: 'scout-start',
        title: 'De opdracht',
        trigger: 'game_start',
        content: 'Ridders — het koninkrijk roept jullie op. Verken het gebied, neem de uitposten in en plant jullie vlag. Wie het meeste grondgebied verovert en de meeste belastingen int, zal als overwinnaar de geschiedenisboeken ingaan. Gebruik de kaart, ken het terrein en wees snel.',
      },
      {
        id: 'scout-mid',
        title: 'Halverwege',
        trigger: 'manual',
        content: 'De verkenningsfase loopt op zijn einde. De sterke posities zijn ingenomen — maar alles kan nog veranderen. Wie slim hergroepeert en de juiste gebieden bewaakt, zal standhouden tot het einde.',
      },
      {
        id: 'scout-end',
        title: 'De kaarten zijn geschreven',
        trigger: 'game_end',
        content: 'De verkenning is voltooid. De gebieden zijn in kaart gebracht en de rijkste ridder staat bekend. Één groep heeft het territorium meester en schrijft voor altijd zijn naam in de kronieken van dit koninkrijk.',
      },
    ],
  },
  {
    id: 'sage',
    name: 'De Wijze',
    emoji: '🦉',
    color: '#0ea5e9',
    tagline: 'Wijsheid boven kracht',
    variant: 'Strategie & verbonden',
    defaultChapters: [
      {
        id: 'sage-start',
        title: 'De les begint',
        trigger: 'game_start',
        content: 'Luister goed, strijders. Kracht alleen wint geen koninkrijken — wijsheid wint ze. Wie slim handelt, de juiste verbonden sluit en zijn gebieden verdedigt zonder roekeloosheid te tonen, zal triomferen. Denk voor je handelt. Elk gebied heeft waarde. Elk verbond is een wapen.',
      },
      {
        id: 'sage-mid',
        title: 'De test',
        trigger: 'manual',
        content: 'Interessant. De strateeg onderscheidt zich nu van de gokker. Wie zijn verbonden heeft gerespecteerd en zijn verdediging op orde heeft, staat er beter voor. De wijze wacht op het juiste moment — dat moment is nu.',
      },
      {
        id: 'sage-end',
        title: 'De wijsste heeft gewonnen',
        trigger: 'game_end',
        content: 'Het spel is gespeeld. De slimste strategen staan bovenaan. Kracht was niet genoeg — inzicht, geduld en het juiste moment bepaalden de uitkomst. De kronieken zullen de namen van de overwinnaars bewaren als voorbeeld voor toekomstige ridders.',
      },
    ],
  },
  {
    id: 'jester',
    name: 'De Nar',
    emoji: '🃏',
    color: '#f59e0b',
    tagline: 'Wie durft wint',
    variant: 'Chaos & lef',
    defaultChapters: [
      {
        id: 'jester-start',
        title: 'Het spektakel begint!',
        trigger: 'game_start',
        content: 'Ha! Welkom in het gekste koninkrijk ter wereld! Regels? Een beetje. Plan? Overgewaardeerd. Lef? Alles! Wie het verst durft te gaan, het meeste risico neemt en toch nog overeind staat, is de ware kampioen. Maak er een spektakel van — de nar verwacht niets minder!',
      },
      {
        id: 'jester-mid',
        title: 'Halverwege de chaos',
        trigger: 'manual',
        content: 'Kijk eens aan! Wat een rommeltje. Prachtig. Maar let op — de nar heeft een scherp oog. Wie nu nog lacht én voorstaat, heeft het goed voor elkaar. De rest: gooi alles op het spel. Er is niets te verliezen dat niet kan worden teruggewonnen!',
      },
      {
        id: 'jester-end',
        title: 'Wat een voorstelling!',
        trigger: 'game_end',
        content: 'Wat een spektakel! Het was rommelig, luidruchtig, onvoorspelbaar en heerlijk. De nar buigt voor de overwinnaar — maar vergeet niet: iedereen die durfde te spelen, heeft gewonnen. Eén staat alleen bovenaan… maar dan net iets meer dan de rest.',
      },
    ],
  },
  {
    id: 'guardian',
    name: 'De Wachter',
    emoji: '🦅',
    color: '#10b981',
    tagline: 'Oog in de hemel',
    variant: 'Verdediging & grondgebied',
    defaultChapters: [
      {
        id: 'guardian-start',
        title: 'De wacht begint',
        trigger: 'game_start',
        content: 'Mijn ogen zien alles. De gebieden liggen open voor wie ze durft te bewaken. Verstevig uw burcht, train uw garnizoen en bescherm wat van u is. Belastingen stromen alleen binnen zolang uw gebieden in uw handen blijven. De wachter beloont de standvastigen — niet de avonturiers.',
      },
      {
        id: 'guardian-mid',
        title: 'De test van standvastigheid',
        trigger: 'manual',
        content: 'De aanvallen zijn begonnen. Wie zijn posities heeft versterkt en zijn verdediging op orde heeft, houdt stand. Wie dat niet heeft gedaan, betaalt nu de prijs. De wachter ziet wie zijn plicht heeft gedaan — en wie niet.',
      },
      {
        id: 'guardian-end',
        title: 'Het koninkrijk heeft gesproken',
        trigger: 'game_end',
        content: 'De strijd is gestreden. Wie zijn grond het langst heeft bewaard, staat nu aan de top. Grondgebied is macht — en macht is verdiend door wie het beschermde, tick na tick. De wachter kroont de standvastigste ridder als heerser van dit koninkrijk.',
      },
    ],
  },
]

export interface CircleGeofence {
  type?: 'circle'
  lat: number
  lng: number
  radius_meters: number
}

export interface PolygonGeofence {
  type: 'polygon'
  points: Array<{ lat: number; lng: number }>
}

export type Geofence = CircleGeofence | PolygonGeofence

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
  geofence?: Geofence | null
  geofence_base_radius?: number
  phases?: GamePhase[]
  home_base?: { lat: number; lng: number } | null
  story?: {
    narrator_id: string
    chapters: StoryChapter[]
  }
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
  region_id: string | null
  region_name: string | null
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
  strategy?: StrategyType | null
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
    label: 'Wachttoren',
    emoji: '🏰',
    description: 'Zie alle ridders in 500m omtrek',
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
    label: 'Garnizoen',
    emoji: '⚔️',
    description: 'Beschermt naburige gebieden',
    crownValue: 5,
    color: '#ef4444',
    ability: 'shield',
  },
  outpost: {
    label: 'Schildwachtpost',
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
    label: 'Uitpost',
    emoji: '🚩',
    description: 'Routebonus bij twee uitposten',
    crownValue: 10,
    color: '#10b981',
    ability: 'route',
  },
  base: {
    label: 'Burcht',
    emoji: '🏰',
    description: 'Startburcht, permanent bezet na inname',
    crownValue: 3,
    color: '#3b82f6',
    ability: 'respawn',
  },
}

export type PowerupType = 'crowns_bonus' | 'double_income' | 'shield' | 'reveal_all' | 'secret_location' | 'steal' | 'crown_rain'

export interface Powerup {
  id: string
  game_id: string
  token: string
  type: PowerupType
  value: Record<string, unknown>
  label: string
  emoji: string
  lat: number | null
  lng: number | null
  claimed_by: string | null
  claimed_at: string | null
  is_secret_location: boolean
  created_at: string
}

export interface PlayerBuff {
  id: string
  player_id: string
  game_id: string
  type: PowerupType
  value: Record<string, unknown>
  expires_at: string
  created_at: string
}

export interface AdminEvent {
  id: string
  game_id: string
  type: 'announcement' | 'double_crowns' | 'storm' | 'bonus_mission' | 'crown_rain' | 'location_boost'
  title: string
  description: string
  value: Record<string, unknown>
  active: boolean
  expires_at: string | null
  created_at: string
}

export const POWERUP_CONFIG: Record<PowerupType, { label: string; emoji: string; description: string; color: string }> = {
  crowns_bonus:    { label: 'Kronen bonus',      emoji: '💰', description: 'Direct extra kronen',              color: '#f59e0b' },
  double_income:   { label: 'Dubbel inkomen',    emoji: '📈', description: '2x kronen voor 5 minuten',         color: '#10b981' },
  shield:          { label: 'Schild',             emoji: '🛡️', description: 'Jouw locaties zijn 5 min veilig',  color: '#6366f1' },
  reveal_all:      { label: 'Radar',              emoji: '📡', description: 'Zie alle spelers 5 min',           color: '#06b6d4' },
  secret_location: { label: 'Geheime locatie',   emoji: '🗝️', description: 'Ontgrendelt een verborgen plek',   color: '#8b5cf6' },
  steal:           { label: 'Diefstal',           emoji: '🦝', description: 'Steel kronen van dichtstbijzijnde', color: '#ef4444' },
  crown_rain:      { label: 'Schatkistuitdeling', emoji: '👑', description: 'Alle ridders krijgen bonus kronen', color: '#eab308' },
}

export const ADMIN_EVENT_TEMPLATES = [
  { type: 'announcement',   emoji: '📢', label: 'Koninklijk decreet', description: 'Stuur een bericht naar alle ridders' },
  { type: 'double_crowns',  emoji: '💎', label: 'Weelde',             description: 'Volgende inning geeft 2x kronen' },
  { type: 'storm',          emoji: '🌩️', label: 'Veldslag',           description: 'Alle gebieden worden neutraal!' },
  { type: 'bonus_mission',  emoji: '🎯', label: 'Queeste',            description: 'Eerste ridder die gebied inneemt wint bonus' },
  { type: 'crown_rain',     emoji: '👑', label: 'Schatkistuitdeling', description: 'Alle ridders krijgen direct kronen' },
  { type: 'location_boost', emoji: '⚡', label: 'Koninklijke zegen',  description: 'Kies een gebied met 3x opbrengst' },
] as const

export const ENCOUNTER_MATRIX: Record<EncounterChoice, Record<EncounterChoice, 'win' | 'lose' | 'draw'>> = {
  attack:  { attack: 'draw', defend: 'lose', trade: 'draw', dodge: 'win' },
  defend:  { attack: 'win',  defend: 'draw', trade: 'draw', dodge: 'draw' },
  trade:   { attack: 'draw', defend: 'draw', trade: 'draw', dodge: 'draw' },
  dodge:   { attack: 'lose', defend: 'draw', trade: 'draw', dodge: 'draw' },
}
