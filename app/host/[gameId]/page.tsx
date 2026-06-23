'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Game, Location, Player, LocationOwnership, LocationType, ChallengeType, LOCATION_TYPE_CONFIG, Powerup, PowerupType, POWERUP_CONFIG, ADMIN_EVENT_TEMPLATES, AdminEvent, DEFAULT_PHASES, GamePhase, StoryChapter, NARRATOR_PRESETS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { OVERPASS_ENDPOINTS, buildOverpassQuery, parseOverpassElements, OverpassElement } from '@/lib/osm-classify'

const HostMap = dynamic(() => import('@/components/host/HostMap'), { ssr: false })
const CrownChart = dynamic(() => import('@/components/host/CrownChart'), { ssr: false })

type Tab = 'setup' | 'command' | 'stats'
type CommandPanel = 'scores' | 'fase' | 'events' | 'spelers' | 'powerups' | 'fotos' | 'allianties'
type SetupMode = 'list' | 'addManual' | 'addOsm' | 'geofence' | 'homebase' | 'story' | 'template'

interface TemplateLocation {
  tempId: string
  lat: number
  lng: number
  name: string
  type: LocationType
  challenge_type: ChallengeType
  crown_value: number
  claim_radius: number
}

interface OsmCandidate {
  id: number; name: string; lat: number; lng: number
  type: LocationType; challenge_type: string; crown_value: number; claim_radius: number
}

interface FullGame extends Game {
  locations: Location[]
  players: Player[]
  location_ownership: (LocationOwnership & { player: Player })[]
}

export default function HostDashboard() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<FullGame | null>(null)
  const [tab, setTab] = useState<Tab>('setup')
  const [loading, setLoading] = useState(true)
  const [hostToken, setHostToken] = useState('')
  const [setupMode, setSetupMode] = useState<SetupMode>('list')
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationForm, setLocationForm] = useState<Partial<Location>>({})
  const [savingStatus, setSavingStatus] = useState('')
  const [osmCandidates, setOsmCandidates] = useState<OsmCandidate[]>([])
  const [selectedOsmIds, setSelectedOsmIds] = useState<Set<number>>(new Set())
  const [osmLoading, setOsmLoading] = useState(false)
  const [osmRadius, setOsmRadius] = useState(800)
  const [osmSearchCenter, setOsmSearchCenter] = useState<{ lat: number; lng: number; radius: number } | null>(null)
  const [geofence, setGeofence] = useState<import('@/lib/types').Geofence | null>(null)
  const [geofenceRadius, setGeofenceRadius] = useState(1000)
  const [geofenceMode, setGeofenceMode] = useState<'circle' | 'polygon'>('circle')
  const [pendingPolygon, setPendingPolygon] = useState<Array<{ lat: number; lng: number }>>([])
  const [homeBase, setHomeBase] = useState<{ lat: number; lng: number } | null>(null)
  const [commandPanel, setCommandPanel] = useState<CommandPanel>('scores')
  const [powerups, setPowerups] = useState<Powerup[]>([])
  const [powerupForm, setPowerupForm] = useState<{ type: PowerupType; label: string; emoji: string; lat: string; lng: string; amount: string; is_secret_location: boolean }>({ type: 'crowns_bonus', label: '', emoji: '💰', lat: '', lng: '', amount: '50', is_secret_location: false })
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([])
  const [timeline, setTimeline] = useState<Array<{ id: string; type: string; player_id: string | null; data: Record<string, unknown>; created_at: string }>>([])
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ id: string; player_id: string; created_at: string; data: Record<string, unknown> }>>([])
  const [photoActionStatus, setPhotoActionStatus] = useState<Record<string, string>>({})
  const [alliances, setAlliances] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [newAllianceName, setNewAllianceName] = useState('')
  const [newAllianceColor, setNewAllianceColor] = useState('#6366f1')
  const [regions, setRegions] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionColor, setNewRegionColor] = useState('#6366f1')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#ef4444')
  const [showGroupQr, setShowGroupQr] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState<{ type: string; title: string; description: string; amount: string; target_player_id: string; location_id: string }>({ type: 'announcement', title: '', description: '', amount: '30', target_player_id: '', location_id: '' })
  const [phases, setPhases] = useState<GamePhase[]>(DEFAULT_PHASES)
  const [stats, setStats] = useState<Record<string, unknown>[]>([])
  const [history, setHistory] = useState<{ players: { id: string; name: string; color: string; avatar?: string }[]; ticks: { timestamp: string; scores: Record<string, number> }[] }>({ players: [], ticks: [] })
  const [kickReason, setKickReason] = useState<Record<string, string>>({})
  const [tickStatus, setTickStatus] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [autoTickEnabled, setAutoTickEnabled] = useState(false)
  const [autoTickInterval, setAutoTickInterval] = useState(2)
  const [osmError, setOsmError] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const setupMapRef = useRef<{ flyTo: (latlng: [number, number], zoom: number) => void } | null>(null)
  const [storyNarratorId, setStoryNarratorId] = useState('scout')
  const [storyChapters, setStoryChapters] = useState<StoryChapter[]>([])
  const [storyDraft, setStoryDraft] = useState<{ title: string; content: string; trigger: StoryChapter['trigger'] }>({ title: '', content: '', trigger: 'manual' })
  const [showStoryForm, setShowStoryForm] = useState(false)
  const [templateLocations, setTemplateLocations] = useState<TemplateLocation[]>([])
  const [templateNumTeams, setTemplateNumTeams] = useState(3)
  const [templateRadius, setTemplateRadius] = useState(400)
  const [templateImporting, setTemplateImporting] = useState(false)
  const [dismissedAdvice, setDismissedAdvice] = useState<Set<string>>(new Set())

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`)
    const data = await res.json()
    if (!res.ok) { setSavingStatus(`Fout: ${data.error ?? res.status}`); setLoading(false); return }
    setGame(data)
    // Restore geofence and home base from config
    if (data.config?.geofence) {
      setGeofence(data.config.geofence)
      if (data.config.geofence.type === 'polygon') setGeofenceMode('polygon')
    }
    if (data.config?.home_base) setHomeBase(data.config.home_base)
    if (data.starts_at) {
      const d = new Date(data.starts_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      setScheduledStart(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
    }
    setLoading(false)
  }, [gameId])

  const fetchPowerups = useCallback(async () => {
    const token = localStorage.getItem('host_token') ?? ''
    const res = await fetch(`/api/powerups?gameId=${gameId}&host_token=${token}`)
    if (res.ok) setPowerups(await res.json())
  }, [gameId])

  const fetchAdminEvents = useCallback(async () => {
    const token = localStorage.getItem('host_token') ?? ''
    const res = await fetch(`/api/admin-events?gameId=${gameId}&host_token=${token}`)
    if (res.ok) setAdminEvents(await res.json())
  }, [gameId])

  const fetchTimeline = useCallback(async () => {
    const token = localStorage.getItem('host_token') ?? ''
    const res = await fetch(`/api/game-events?gameId=${gameId}&host_token=${token}`)
    if (res.ok) setTimeline(await res.json())
  }, [gameId])

  const fetchAlliances = useCallback(async () => {
    const res = await fetch(`/api/alliances?gameId=${gameId}`)
    if (res.ok) setAlliances(await res.json())
  }, [gameId])

  const fetchRegions = useCallback(async () => {
    const res = await fetch(`/api/regions?gameId=${gameId}`)
    if (res.ok) setRegions(await res.json())
  }, [gameId])

  const fetchPendingPhotos = useCallback(async () => {
    const token = localStorage.getItem('host_token') ?? hostToken
    const res = await fetch(`/api/game-events?gameId=${gameId}&host_token=${token}&type=photo_pending`)
    if (res.ok) setPendingPhotos(await res.json())
  }, [gameId, hostToken])

  useEffect(() => {
    const token = localStorage.getItem('host_token') ?? ''
    setHostToken(token)
    fetchGame()
    fetch(`/api/alliances?gameId=${gameId}`).then(r => r.ok ? r.json() : []).then(setAlliances)
    fetchRegions()
    fetchTimeline()
  }, [fetchGame, gameId, fetchRegions, fetchTimeline])

  const fetchStats = useCallback(async () => {
    const [statsRes, histRes] = await Promise.all([
      fetch(`/api/stats?gameId=${gameId}`),
      fetch(`/api/stats/history?gameId=${gameId}`),
    ])
    if (statsRes.ok) setStats(await statsRes.json())
    if (histRes.ok) setHistory(await histRes.json())
  }, [gameId])

  useEffect(() => {
    if (tab === 'command' && commandPanel === 'powerups') fetchPowerups()
    if (tab === 'command' && commandPanel === 'events') fetchAdminEvents()
    if (tab === 'command' && commandPanel === 'fotos') fetchPendingPhotos()
    if (tab === 'command' && commandPanel === 'allianties') fetchAlliances()
    if (tab === 'stats') fetchStats()
  }, [tab, commandPanel, fetchPowerups, fetchAdminEvents, fetchPendingPhotos, fetchAlliances, fetchStats])

  // Auto-tick interval
  useEffect(() => {
    if (autoTickRef.current) { clearInterval(autoTickRef.current); autoTickRef.current = null }
    if (!autoTickEnabled || !hostToken) return
    autoTickRef.current = setInterval(async () => {
      const res = await fetch('/api/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: gameId, host_token: hostToken }) })
      const d = await res.json()
      setSavingStatus(res.ok ? `✅ Auto-tick: ${d.paid} spelers` : `❌ Tick fout`)
      setTimeout(() => setSavingStatus(''), 2500)
      await fetchGame()
    }, autoTickInterval * 60 * 1000)
    return () => { if (autoTickRef.current) clearInterval(autoTickRef.current) }
  }, [autoTickEnabled, autoTickInterval, gameId, hostToken, fetchGame])

  // Load phases + story from game config
  useEffect(() => {
    if (!game) return
    const cfg = game.config as Record<string, unknown>
    if (cfg.phases) setPhases(cfg.phases as GamePhase[])
    if (cfg.story) {
      const s = cfg.story as { narrator_id: string; chapters: StoryChapter[] }
      setStoryNarratorId(s.narrator_id ?? 'scout')
      setStoryChapters(s.chapters ?? [])
    }
  }, [game?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch tabs on status change
  useEffect(() => {
    if (!game) return
    if (game.status === 'active') setTab('command')
    if (game.status === 'ended') setTab('stats')
  }, [game?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game) return
    const supabase = createClient()
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, fetchGame)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_ownership' }, fetchGame)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${gameId}` }, (payload) => {
        if ((payload.new as { type?: string })?.type === 'photo_pending') fetchPendingPhotos()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [game, gameId, fetchGame])

  // Auto-start: check every 30s if scheduled start time has passed
  useEffect(() => {
    if (!game || game.status !== 'setup' || !game.starts_at) return
    const check = async () => {
      if (new Date(game.starts_at as string) <= new Date()) {
        const token = localStorage.getItem('host_token') ?? hostToken
        await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, status: 'active' }) })
        fetchGame()
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [game?.status, game?.starts_at, gameId, hostToken, fetchGame])

  // Crown tick interval
  useEffect(() => {
    if (!game || game.status !== 'active') { if (tickRef.current) clearInterval(tickRef.current); return }
    const intervalMin = (game.config as { crown_tick_interval_minutes?: number })?.crown_tick_interval_minutes ?? 2
    const doTick = async () => {
      const res = await fetch('/api/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, host_token: hostToken }),
      })
      if (res.ok) {
        const d = await res.json()
        setTickStatus(`✅ Tick: ${d.paid} spelers uitbetaald`)
        setTimeout(() => setTickStatus(''), 3000)
      }
    }
    tickRef.current = setInterval(doTick, intervalMin * 60 * 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [game?.status, game?.config, gameId, hostToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Game timer countdown
  useEffect(() => {
    if (!game?.ends_at) return
    let hasEnded = false
    const update = () => {
      const left = new Date(game.ends_at!).getTime() - Date.now()
      if (left <= 0) {
        setTimeLeft('00:00')
        if (!hasEnded) { hasEnded = true; endGame(true) }
        return
      }
      const m = Math.floor(left / 60000)
      const s = Math.floor((left % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [game?.ends_at]) // eslint-disable-line react-hooks/exhaustive-deps

  async function dispatchStoryChapter(chapter: StoryChapter, narratorId: string) {
    await fetch('/api/game-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_token: hostToken, game_id: gameId, type: 'story',
        data: { chapter_id: chapter.id, title: chapter.title, content: chapter.content, trigger: chapter.trigger, narrator_id: narratorId },
      }),
    })
  }

  async function saveStory() {
    const currentConfig = game?.config ?? {}
    setSavingStatus('Opslaan...')
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, story: { narrator_id: storyNarratorId, chapters: storyChapters } } }),
    })
    await fetchGame()
    setSavingStatus('✅ Verhaal opgeslagen')
    setTimeout(() => setSavingStatus(''), 2000)
  }

  async function startGame() {
    setSavingStatus('Starten...')
    const config = game?.config ?? {}
    const durationMin = (config as { duration_minutes?: number }).duration_minutes
    const endsAt = durationMin ? new Date(Date.now() + durationMin * 60000).toISOString() : null
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, status: 'active', starts_at: new Date().toISOString(), ...(endsAt ? { ends_at: endsAt } : {}) }),
    })
    const intro = storyChapters.find(c => c.trigger === 'game_start')
    if (intro) await dispatchStoryChapter(intro, storyNarratorId)
    await fetchGame()
    setSavingStatus('')
  }

  async function endGame(skipConfirm = false) {
    if (!skipConfirm && !confirm('Spel beëindigen?')) return
    const outro = storyChapters.find(c => c.trigger === 'game_end')
    if (outro) await dispatchStoryChapter(outro, storyNarratorId)
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, status: 'ended', ends_at: new Date().toISOString() }),
    })
    await fetchGame()
  }

  async function manualTick() {
    setSavingStatus('Uitbetalen...')
    const res = await fetch('/api/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, host_token: hostToken }),
    })
    const d = await res.json()
    setSavingStatus(res.ok ? `✅ ${d.paid} spelers uitbetaald` : `❌ ${d.error}`)
    setTimeout(() => setSavingStatus(''), 3000)
  }

  async function saveLocation() {
    if (!pendingLocation || !locationForm.name) return
    setSavingStatus('Opslaan...')
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_token: hostToken, game_id: gameId,
        lat: pendingLocation.lat, lng: pendingLocation.lng,
        name: locationForm.name, description: locationForm.description ?? '',
        type: locationForm.type ?? 'checkpoint',
        challenge_type: locationForm.challenge_type ?? 'checkin',
        challenge_data: locationForm.challenge_data ?? {},
        claim_radius: locationForm.claim_radius ?? 50,
        crown_value: LOCATION_TYPE_CONFIG[(locationForm.type as LocationType) ?? 'checkpoint'].crownValue,
      }),
    })
    if (res.ok) { setPendingLocation(null); setLocationForm({}); setSetupMode('list'); await fetchGame() }
    setSavingStatus('')
  }

  async function importOsmSelected() {
    const selected = osmCandidates.filter(c => selectedOsmIds.has(c.id))
    setSavingStatus(`Importeren (0/${selected.length})...`)
    let done = 0
    for (const c of selected) {
      await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_token: hostToken, game_id: gameId, lat: c.lat, lng: c.lng, name: c.name, type: c.type, challenge_type: c.challenge_type, crown_value: c.crown_value, claim_radius: c.claim_radius, description: '' }),
      })
      done++
      setSavingStatus(`Importeren (${done}/${selected.length})...`)
    }
    setOsmCandidates([])
    setSelectedOsmIds(new Set())
    setSetupMode('list')
    await fetchGame()
    setSavingStatus('')
  }

  async function savePolygonGeofence(points: Array<{ lat: number; lng: number }>) {
    const newGeofence = { type: 'polygon' as const, points }
    setGeofence(newGeofence)
    setPendingPolygon([])
    const currentConfig = game?.config ?? {}
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, geofence: newGeofence, geofence_base_radius: undefined } }),
    })
    await fetchGame()
    // Auto-load OSM for the new geofence
    if (game?.locations.length === 0) {
      const p = geofenceToOsmParams(newGeofence)
      setSetupMode('addOsm')
      fetchOsm(p.lat, p.lng, p.radius_meters)
    } else {
      setSetupMode('list')
    }
  }

  async function saveGeofence(lat: number, lng: number) {
    const newGeofence = { lat, lng, radius_meters: geofenceRadius }
    setGeofence(newGeofence)
    const currentConfig = game?.config ?? {}
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, geofence: newGeofence } }),
    })
    // Auto-load OSM if no locations yet
    if (game?.locations.length === 0) {
      setSetupMode('addOsm')
      fetchOsm(lat, lng, geofenceRadius)
    } else {
      setSetupMode('list')
    }
  }

  async function saveHomeBase(lat: number, lng: number) {
    const newHomeBase = { lat, lng }
    setHomeBase(newHomeBase)
    const currentConfig = game?.config ?? {}
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, home_base: newHomeBase } }),
    })
    setSetupMode('list')
  }

  async function saveSettings(updates: Record<string, unknown>) {
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, ...updates }),
    })
    await fetchGame()
  }

  async function deleteLocation(id: string) {
    await fetch(`/api/locations/${id}?host_token=${hostToken}`, { method: 'DELETE' })
    await fetchGame()
  }

  async function moveLocation(id: string, lat: number, lng: number) {
    const token = localStorage.getItem('host_token') ?? hostToken
    await fetch(`/api/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: token, lat, lng }),
    })
    await fetchGame()
  }

  function generateTemplate(centerLat: number, centerLng: number) {
    const n = templateNumTeams
    const r = templateRadius
    const toRad = (d: number) => d * Math.PI / 180
    const R = 6371000
    const offsetLat = (m: number) => m / R * (180 / Math.PI)
    const offsetLng = (m: number, lat: number) => m / (R * Math.cos(toRad(lat))) * (180 / Math.PI)

    const locs: TemplateLocation[] = []

    // 1 Burcht per team, evenly spaced in a ring
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      locs.push({
        tempId: `base-${i}`,
        lat: centerLat + offsetLat(r * Math.sin(angle)),
        lng: centerLng + offsetLng(r * Math.cos(angle), centerLat),
        name: `Burcht ${i + 1}`,
        type: 'base',
        challenge_type: 'checkin',
        crown_value: LOCATION_TYPE_CONFIG.base.crownValue,
        claim_radius: 60,
      })
    }

    // 1 Uitpost between each pair of burchten
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * (i + 0.5)) / n - Math.PI / 2
      locs.push({
        tempId: `cp-${i}`,
        lat: centerLat + offsetLat(r * 0.7 * Math.sin(angle)),
        lng: centerLng + offsetLng(r * 0.7 * Math.cos(angle), centerLat),
        name: `Uitpost ${i + 1}`,
        type: 'checkpoint',
        challenge_type: 'checkin',
        crown_value: LOCATION_TYPE_CONFIG.checkpoint.crownValue,
        claim_radius: 50,
      })
    }

    // 1 Markt in the center
    locs.push({
      tempId: 'market-0',
      lat: centerLat + offsetLat(r * 0.15),
      lng: centerLng,
      name: 'Centrale Markt',
      type: 'market',
      challenge_type: 'checkin',
      crown_value: LOCATION_TYPE_CONFIG.market.crownValue,
      claim_radius: 50,
    })

    // 1 Wachttoren slightly offset from center
    locs.push({
      tempId: 'tower-0',
      lat: centerLat - offsetLat(r * 0.15),
      lng: centerLng + offsetLng(r * 0.1, centerLat),
      name: 'Wachttoren',
      type: 'tower',
      challenge_type: 'quiz',
      crown_value: LOCATION_TYPE_CONFIG.tower.crownValue,
      claim_radius: 50,
    })

    setTemplateLocations(locs)
    setSetupMode('template')
  }

  async function importTemplateLocations() {
    if (templateLocations.length === 0) return
    setTemplateImporting(true)
    for (const tl of templateLocations) {
      await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_token: hostToken, game_id: gameId,
          lat: tl.lat, lng: tl.lng, name: tl.name, type: tl.type,
          challenge_type: tl.challenge_type, crown_value: tl.crown_value,
          claim_radius: tl.claim_radius, description: '',
        }),
      })
    }
    setTemplateLocations([])
    setSetupMode('list')
    await fetchGame()
    setTemplateImporting(false)
  }

  function geofenceToOsmParams(gf: import('@/lib/types').Geofence): { lat: number; lng: number; radius_meters: number } {
    if (gf.type === 'polygon') {
      const n = gf.points.length
      const clat = gf.points.reduce((s, p) => s + p.lat, 0) / n
      const clng = gf.points.reduce((s, p) => s + p.lng, 0) / n
      const toRad = (d: number) => d * Math.PI / 180
      const radius = Math.max(...gf.points.map(p => {
        const R = 6371000, dLat = toRad(p.lat - clat), dLng = toRad(p.lng - clng)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(clat)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2
        return 2 * R * Math.asin(Math.sqrt(a))
      }))
      return { lat: clat, lng: clng, radius_meters: Math.ceil(radius) }
    }
    return { lat: gf.lat, lng: gf.lng, radius_meters: gf.radius_meters }
  }

  async function fetchOsm(lat: number, lng: number, radius?: number) {
    const searchRadius = radius ?? osmRadius
    setOsmLoading(true)
    setOsmError(null)
    setOsmSearchCenter({ lat, lng, radius: searchRadius })

    const query = buildOverpassQuery(lat, lng, searchRadius)
    let rawData: { elements?: OverpassElement[] } | null = null
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: query,
          headers: { 'Content-Type': 'text/plain' },
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) { rawData = await res.json(); break }
      } catch { /* try next endpoint */ }
    }

    setOsmLoading(false)
    if (!rawData) { setOsmError('Overpass API niet bereikbaar — probeer later opnieuw'); return }
    const locations = parseOverpassElements(rawData.elements ?? [])
    if (locations.length === 0) { setOsmError('Geen locaties gevonden in dit gebied. Probeer een grotere radius.'); return }
    setOsmCandidates(locations)
    setSelectedOsmIds(new Set(locations.map(c => c.id)))
  }

  async function createPowerup() {
    const cfg = POWERUP_CONFIG[powerupForm.type]
    const res = await fetch('/api/powerups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_token: hostToken, game_id: gameId,
        type: powerupForm.type,
        label: powerupForm.label || cfg.label,
        emoji: powerupForm.emoji || cfg.emoji,
        lat: powerupForm.lat ? parseFloat(powerupForm.lat) : null,
        lng: powerupForm.lng ? parseFloat(powerupForm.lng) : null,
        value: powerupForm.type === 'crowns_bonus' ? { amount: parseInt(powerupForm.amount) } : {},
        is_secret_location: powerupForm.is_secret_location,
      }),
    })
    if (res.ok) {
      await fetchPowerups()
      setPowerupForm(f => ({ ...f, label: '', lat: '', lng: '' }))
    }
  }

  async function sendAdminEventRaw(type: string, title: string, description: string, value: Record<string, unknown>, expires_minutes: number | null, target_player_id: string | null) {
    setSavingStatus('Versturen...')
    try {
      const token = localStorage.getItem('host_token') ?? hostToken
      const res = await fetch('/api/admin-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_token: token, game_id: gameId, type, title, description, value, expires_minutes, target_player_id }),
      })
      const d = await res.json()
      if (res.ok) {
        await fetchAdminEvents()
        await fetchGame()
        setSavingStatus(`✅ ${title} verstuurd`)
        setTimeout(() => setSavingStatus(''), 2500)
      } else {
        setSavingStatus(`❌ ${d.error ?? `HTTP ${res.status}`}`)
        setTimeout(() => setSavingStatus(''), 5000)
      }
    } catch (err) {
      setSavingStatus(`❌ Netwerkfout: ${String(err)}`)
      setTimeout(() => setSavingStatus(''), 5000)
    }
  }

  async function sendAdminEvent() {
    if (!eventForm.title) return
    const type = eventForm.type
    let value: Record<string, unknown> = {}
    let expires: number | null = null
    if (type === 'crown_rain' || type === 'double_crowns') {
      value = { amount: parseInt(eventForm.amount) }
      if (type === 'double_crowns') expires = 5
    } else if (type === 'location_boost') {
      if (!eventForm.location_id) { setSavingStatus('❌ Kies een locatie'); setTimeout(() => setSavingStatus(''), 3000); return }
      value = { location_id: eventForm.location_id, boost_factor: 3 }
      expires = 15
    } else if (type === 'bonus_mission') {
      if (!eventForm.location_id) { setSavingStatus('❌ Kies een locatie'); setTimeout(() => setSavingStatus(''), 3000); return }
      value = { location_id: eventForm.location_id, bonus_crowns: parseInt(eventForm.amount) || 100 }
    }
    await sendAdminEventRaw(type, eventForm.title, eventForm.description, value, expires, eventForm.target_player_id || null)
    setEventForm(f => ({ ...f, title: '', description: '', location_id: '' }))
  }

  async function nextPhase() {
    setSavingStatus('Fase wisselen...')
    const res = await fetch(`/api/games/${gameId}/next-phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken }),
    })
    const d = await res.json()
    if (res.ok) {
      setSavingStatus(`✅ Fase: ${d.phase.name} · ${d.neutralized} locaties neutraal`)
      await fetchGame()
    } else {
      setSavingStatus(`❌ ${d.error}`)
    }
    setTimeout(() => setSavingStatus(''), 4000)
  }

  async function savePhases() {
    const currentConfig = game?.config ?? {}
    setSavingStatus('Fases opslaan...')
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, phases } }),
    })
    await fetchGame()
    setSavingStatus('✅ Fases opgeslagen')
    setTimeout(() => setSavingStatus(''), 2000)
  }

  async function clusterRegions() {
    setSavingStatus('Regio\'s groeperen...')
    const res = await fetch(`/api/games/${gameId}/cluster-regions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken }),
    })
    const d = await res.json()
    if (res.ok) {
      setSavingStatus(`✅ ${d.regions} regio's aangemaakt`)
      await fetchGame()
    } else {
      setSavingStatus(`❌ ${d.error}`)
    }
    setTimeout(() => setSavingStatus(''), 3000)
  }

  async function kickPlayer(playerId: string) {
    const reason = kickReason[playerId]?.trim()
    if (!reason) { alert('Geef een reden op'); return }
    if (!confirm(`Speler verwijderen? Reden: "${reason}"`)) return
    const res = await fetch(`/api/players/${playerId}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, reason }),
    })
    if (res.ok) { setKickReason(r => ({ ...r, [playerId]: '' })); await fetchGame() }
  }

  async function restartGame() {
    if (!confirm('Een nieuwe ronde starten? Dit reset alle kronen en bezit.')) return
    setSavingStatus('Reset...')
    // Clear ownership
    await fetch(`/api/games/${gameId}/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken }),
    })
    await fetchGame()
    setSavingStatus('')
  }

  if (loading) return <div className="h-full flex items-center justify-center text-white/40">Laden...</div>
  if (!game) return null

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}` : ''

  // Compute initial map center: homeBase > geofence > centroid of locations > Amsterdam
  const initialCenter = (() => {
    if (homeBase) return [homeBase.lat, homeBase.lng] as [number, number]
    if (geofence) {
      if (geofence.type === 'polygon' && geofence.points.length > 0) {
        const n = geofence.points.length
        return [geofence.points.reduce((s, p) => s + p.lat, 0) / n, geofence.points.reduce((s, p) => s + p.lng, 0) / n] as [number, number]
      } else if ('lat' in geofence) return [geofence.lat, geofence.lng] as [number, number]
    }
    if (game.locations.length > 0) {
      const avgLat = game.locations.reduce((s, l) => s + l.lat, 0) / game.locations.length
      const avgLng = game.locations.reduce((s, l) => s + l.lng, 0) / game.locations.length
      return [avgLat, avgLng] as [number, number]
    }
    return undefined
  })()
  const config = game.config as Record<string, unknown>
  const hostNarratorId = (config?.story as Record<string, unknown> | undefined)?.narrator_id as string | undefined
  const hostNarrator = NARRATOR_PRESETS.find(n => n.id === hostNarratorId) ?? null
  const hostNarratorColor = hostNarrator?.color ?? '#2563eb'

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3" style={{ background: `linear-gradient(135deg,${hostNarratorColor} 0%,${hostNarratorColor}cc 100%)` }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-3">
            <h1 className="font-black text-base leading-tight truncate text-white">{game.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="font-black text-xs px-2 py-0.5 rounded-lg" style={{ background: '#fff', color: hostNarratorColor }}>{game.code}</span>
              <span className="font-bold text-xs px-2 py-0.5 rounded-lg" style={{
                background: game.status === 'active' ? '#22c55e' : game.status === 'ended' ? '#ef4444' : '#f59e0b',
                color: '#fff',
              }}>
                {game.status === 'setup' ? '◎ Voorbereiding' : game.status === 'active' ? '● Actief' : '✕ Beëindigd'}
              </span>
              {timeLeft && <span className="font-bold text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>⏱ {timeLeft}</span>}
              {tickStatus && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>{tickStatus}</span>}
              {savingStatus && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{savingStatus}</span>}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {game.status === 'active' && (
              <button onClick={manualTick} className="px-3 py-1.5 font-bold text-xs rounded-xl transition-all" style={{ background: '#f59e0b', color: '#fff', boxShadow: '0 2px 6px rgba(245,158,11,0.4)' }}>👑 Tick</button>
            )}
            {game.status === 'setup' && (
              <button onClick={startGame} disabled={game.locations.length === 0} className="px-3 py-1.5 font-black text-xs rounded-xl transition-all disabled:opacity-40" style={{ background: '#22c55e', color: '#fff', boxShadow: '0 2px 8px rgba(34,197,94,0.4)' }}>▶ Start</button>
            )}
            {game.status === 'active' && (
              <button onClick={() => endGame()} className="px-3 py-1.5 font-bold text-xs rounded-xl transition-all" style={{ background: '#ef4444', color: '#fff', boxShadow: '0 2px 6px rgba(239,68,68,0.4)' }}>■ Stop</button>
            )}
          </div>
        </div>
        {/* Join URL bar */}
        <div className="mt-2.5 flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <span className="text-xs font-bold text-white opacity-70">Join:</span>
          <span className="text-xs text-white truncate flex-1 opacity-90">{joinUrl}</span>
          <button
            onClick={async () => {
              if (navigator.share) {
                try { await navigator.share({ title: game.name, text: `Code: ${game.code}`, url: joinUrl }) } catch {}
              } else {
                navigator.clipboard.writeText(joinUrl)
              }
            }}
            className="shrink-0 px-2 py-0.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
            ⬆ Deel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 px-2 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {game.status === 'setup' && (
          <button onClick={() => setTab('setup')}
            className="flex-1 py-2 rounded-xl mono text-xs font-bold tracking-widest uppercase transition-all"
            style={{ background: tab === 'setup' ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'var(--surface2)', color: tab === 'setup' ? '#fff' : 'var(--muted)', boxShadow: tab === 'setup' ? '0 2px 8px rgba(22,163,74,0.35)' : undefined }}>
            OPSTELLING
          </button>
        )}
        {(game.status === 'active' || game.status === 'ended') && (
          <button onClick={() => setTab('command')}
            className="flex-1 py-2 rounded-xl mono text-xs font-bold tracking-widest uppercase transition-all"
            style={{ background: tab === 'command' ? hostNarratorColor : 'var(--surface2)', color: tab === 'command' ? '#fff' : 'var(--muted)', boxShadow: tab === 'command' ? `0 2px 8px ${hostNarratorColor}55` : undefined }}>
            SPELLEIDING
          </button>
        )}
        {(game.status === 'active' || game.status === 'ended') && (
          <button onClick={() => { setTab('stats'); fetchStats() }}
            className="flex-1 py-2 rounded-xl mono text-xs font-bold tracking-widest uppercase transition-all"
            style={{ background: tab === 'stats' ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--surface2)', color: tab === 'stats' ? '#fff' : 'var(--muted)', boxShadow: tab === 'stats' ? '0 2px 8px rgba(245,158,11,0.35)' : undefined }}>
            STATS
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* ── SETUP TAB ── */}
        {tab === 'setup' && (
          <div className="h-full flex">
            <div className="flex-1 relative">
              <HostMap
                locations={game.locations}
                ownership={game.location_ownership}
                regions={regions}
                addingMode={setupMode === 'addManual' || (setupMode === 'addOsm' && osmCandidates.length === 0) || (setupMode === 'template' && templateLocations.length === 0)}
                drawingGeofence={setupMode === 'geofence'}
                geofence={
                  setupMode === 'geofence' && geofenceMode === 'circle' && geofence && geofence.type !== 'polygon'
                    ? { ...geofence, radius_meters: geofenceRadius }
                    : geofence
                }
                pendingPolygon={setupMode === 'geofence' && geofenceMode === 'polygon' ? pendingPolygon : undefined}
                osmCandidates={setupMode === 'addOsm' ? osmCandidates : []}
                selectedOsmIds={selectedOsmIds}
                osmSearchCircle={setupMode === 'addOsm' && osmSearchCenter ? osmSearchCenter : null}
                onOsmCandidateClick={c => setSelectedOsmIds(prev => {
                  const next = new Set(prev)
                  next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                  return next
                })}
                onMapClick={(lat, lng) => {
                  if (setupMode === 'addManual') { setPendingLocation({ lat, lng }); setLocationForm({ type: 'checkpoint', challenge_type: 'checkin', claim_radius: 50 }) }
                  if (setupMode === 'addOsm' && osmCandidates.length === 0) fetchOsm(lat, lng)
                  if (setupMode === 'template' && templateLocations.length === 0) generateTemplate(lat, lng)
                }}
                onGeofenceSet={(lat, lng) => {
                  if (geofenceMode === 'polygon') {
                    setPendingPolygon(prev => [...prev, { lat, lng }])
                  } else {
                    saveGeofence(lat, lng)
                  }
                }}
                pendingLocation={pendingLocation}
                onDeleteLocation={deleteLocation}
                onMapReady={m => { setupMapRef.current = m as { flyTo: (latlng: [number, number], zoom: number) => void } }}
                initialCenter={initialCenter}
                homebaseMode={setupMode === 'homebase'}
                onHomebaseSet={saveHomeBase}
                homeBase={homeBase}
                draggableLocations={setupMode === 'list'}
                onLocationMove={moveLocation}
                templateLocations={setupMode === 'template' ? templateLocations : []}
                onTemplateDrag={(tempId, lat, lng) => setTemplateLocations(prev => prev.map(t => t.tempId === tempId ? { ...t, lat, lng } : t))}
              />

              {/* Toolbar */}
              <div className="absolute bottom-4 left-4 z-[1000] flex gap-1.5 flex-wrap">
                {[
                  { mode: 'addManual', label: '+ POST', active: setupMode === 'addManual', onClick: () => { setSetupMode(setupMode === 'addManual' ? 'list' : 'addManual'); setPendingLocation(null) } },
                  { mode: 'addOsm',    label: '🌍 OSM',   active: setupMode === 'addOsm',    onClick: () => { setSetupMode(setupMode === 'addOsm' ? 'list' : 'addOsm'); setOsmCandidates([]) } },
                  { mode: 'template',  label: '✦ TEMPLATE', active: setupMode === 'template', onClick: () => { if (setupMode === 'template') { setSetupMode('list'); setTemplateLocations([]) } else { setSetupMode('template') } } },
                  { mode: 'homebase',  label: homeBase ? '🏠 INGESTELD' : '🏠 BASIS', active: setupMode === 'homebase', onClick: () => setSetupMode(setupMode === 'homebase' ? 'list' : 'homebase') },
                  { mode: 'geofence',  label: geofence ? '◯ ZONE ◉' : '◯ ZONE',    active: setupMode === 'geofence', onClick: () => setSetupMode(setupMode === 'geofence' ? 'list' : 'geofence') },
                  { mode: 'story',     label: '📖 VERHAAL', active: setupMode === 'story', onClick: () => setSetupMode(setupMode === 'story' ? 'list' : 'story') },
                ].map(btn => (
                  <button key={btn.mode} onClick={btn.onClick}
                    className="px-3 py-2 font-bold text-xs rounded-xl transition-all shadow-xl"
                    style={{
                      background: btn.active ? '#ef4444' : 'linear-gradient(145deg,#1e293b,#0f172a)',
                      color: '#fff',
                      boxShadow: btn.active ? '0 2px 8px rgba(239,68,68,0.45)' : '0 3px 10px rgba(0,0,0,0.4)',
                      border: btn.active ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                    {btn.active ? `✕ Stop` : btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div className="w-80 overflow-y-auto" style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)' }}>

              {/* Manual add form */}
              {setupMode === 'addManual' && pendingLocation && (
                <div className="p-3 space-y-2.5 text-sm">
                  <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>Nieuwe post</p>
                  <input placeholder="Naam" value={locationForm.name ?? ''} onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm outline-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border2)', color: 'var(--text)' }} />
                  <textarea placeholder="Beschrijving" value={locationForm.description ?? ''} onChange={e => setLocationForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} className="w-full px-3 py-2 text-sm outline-none resize-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Type</label>
                    <select value={locationForm.type ?? 'checkpoint'} onChange={e => setLocationForm(f => ({ ...f, type: e.target.value as LocationType }))}
                      className="w-full px-3 py-2 outline-none rounded-xl text-sm" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                      {(Object.entries(LOCATION_TYPE_CONFIG) as [LocationType, typeof LOCATION_TYPE_CONFIG[LocationType]][]).map(([k, v]) => (
                        <option key={k} value={k}>{v.emoji} {v.label} (+{v.crownValue}/tick)</option>
                      ))}
                    </select>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{LOCATION_TYPE_CONFIG[(locationForm.type as LocationType) ?? 'checkpoint'].description}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Uitdaging</label>
                    <select value={locationForm.challenge_type ?? 'checkin'} onChange={e => setLocationForm(f => ({ ...f, challenge_type: e.target.value as ChallengeType }))}
                      className="w-full px-3 py-2 outline-none rounded-xl text-sm" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                      <option value="checkin">Check-in</option>
                      <option value="quiz">Quiz</option>
                      <option value="photo">Foto</option>
                      <option value="puzzle">Puzzel</option>
                      <option value="timed">Tijdslimiet</option>
                    </select>
                  </div>
                  {(locationForm.challenge_type === 'quiz' || locationForm.challenge_type === 'puzzle') && (<>
                    <input placeholder="Vraag" value={(locationForm.challenge_data as { question?: string })?.question ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), question: e.target.value } }))} className="w-full px-3 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                    <input placeholder="Antwoord" value={(locationForm.challenge_data as { answer?: string })?.answer ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), answer: e.target.value } }))} className="w-full px-3 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                  </>)}
                  {locationForm.challenge_type === 'photo' && (
                    <input placeholder="Foto opdracht" value={(locationForm.challenge_data as { photo_prompt?: string })?.photo_prompt ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { photo_prompt: e.target.value } }))} className="w-full px-3 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                  )}
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Bereikradius: {locationForm.claim_radius ?? 50}m</label>
                    <input type="range" min={20} max={200} step={10} value={locationForm.claim_radius ?? 50} onChange={e => setLocationForm(f => ({ ...f, claim_radius: +e.target.value }))} className="w-full" />
                  </div>
                  <button onClick={saveLocation} disabled={!locationForm.name} className="w-full py-3 font-black text-sm rounded-xl transition-all disabled:opacity-40 text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 10px rgba(22,163,74,0.35)' }}>Opslaan</button>
                </div>
              )}

              {/* OSM import panel */}
              {setupMode === 'addOsm' && (
                <div className="flex flex-col h-full">
                  <div className="p-3 space-y-2.5 text-sm shrink-0">
                    <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>OSM import</p>
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Zoekradius: {osmRadius}m</label>
                      <input type="range" min={200} max={2000} step={100} value={osmRadius} onChange={e => setOsmRadius(+e.target.value)} className="w-full" />
                    </div>
                    {geofence && osmCandidates.length === 0 && !osmLoading && (
                      <button onClick={() => { const p = geofenceToOsmParams(geofence); fetchOsm(p.lat, p.lng, p.radius_meters) }}
                        className="w-full py-2.5 font-bold text-sm rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                        Zoek binnen geofence
                      </button>
                    )}
                    {osmCandidates.length === 0 ? (
                      <div className="p-4 rounded-xl text-center space-y-1.5" style={{ background: 'var(--surface2)', border: `1.5px dashed ${osmLoading ? 'var(--border)' : osmError ? '#fca5a5' : 'var(--border2)'}` }}>
                        {osmLoading
                          ? <><p className="text-sm animate-spin inline-block" style={{ color: 'var(--blue)' }}>⟳</p><p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Ophalen… (max 9s)</p></>
                          : osmError
                          ? <><p className="text-sm font-bold" style={{ color: '#dc2626' }}>⚠ {osmError}</p><p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Klik op de kaart om opnieuw te proberen</p></>
                          : <><p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Klik op de kaart</p><p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>om locaties te zoeken</p></>
                        }
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}><span className="font-black" style={{ color: 'var(--accent)' }}>{selectedOsmIds.size}</span> / {osmCandidates.length} geselecteerd</p>
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedOsmIds(new Set(osmCandidates.map(c => c.id)))} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: '#eff6ff', color: '#2563eb' }}>Alles</button>
                          <button onClick={() => setSelectedOsmIds(new Set())} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--dim)' }}>Geen</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {osmCandidates.length > 0 && (
                    <>
                      <div className="flex-1 overflow-y-auto px-3 space-y-1 min-h-0">
                        {osmCandidates.map(c => {
                          const sel = selectedOsmIds.has(c.id)
                          const cfg = LOCATION_TYPE_CONFIG[c.type]
                          return (
                            <button key={c.id} onClick={() => setSelectedOsmIds(prev => { const n = new Set(prev); sel ? n.delete(c.id) : n.add(c.id); return n })}
                              className="w-full flex items-center gap-2 p-2 rounded-xl text-left transition-all"
                              style={{ background: sel ? '#f0fdf4' : 'var(--surface2)', border: `1.5px solid ${sel ? '#86efac' : 'var(--border)'}` }}>
                              <span className="text-base shrink-0">{cfg.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                                <p className="text-xs" style={{ color: 'var(--muted)' }}>{cfg.label} · +{c.crown_value}👑/t</p>
                              </div>
                              <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0" style={{ background: sel ? '#22c55e' : 'var(--surface)', border: `1.5px solid ${sel ? '#22c55e' : 'var(--border)'}` }}>
                                {sel && <span className="text-[11px] font-black text-white">✓</span>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      <div className="p-3 space-y-1.5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                        <button onClick={importOsmSelected} disabled={selectedOsmIds.size === 0}
                          className="w-full py-3 font-black text-sm rounded-xl transition-all disabled:opacity-40 text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 10px rgba(22,163,74,0.35)' }}>
                          {selectedOsmIds.size > 0 ? `✓ ${selectedOsmIds.size} importeren` : 'Selecteer locaties'}
                        </button>
                        <button onClick={() => { setOsmCandidates([]); setSelectedOsmIds(new Set()) }} className="w-full py-1.5 text-xs font-medium" style={{ color: 'var(--dim)' }}>↩ Opnieuw zoeken</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Template generator panel */}
              {setupMode === 'template' && (
                <div className="p-3 space-y-3 text-sm">
                  <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>✦ Locatie template</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {templateLocations.length === 0
                      ? 'Klik op de kaart om het middelpunt te kiezen.'
                      : `${templateLocations.length} locaties gegenereerd. Sleep markers om te positioneren.`}
                  </p>

                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Aantal teams: {templateNumTeams}</label>
                    <input type="range" min={2} max={6} step={1} value={templateNumTeams} onChange={e => { setTemplateNumTeams(+e.target.value); setTemplateLocations([]) }} className="w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Speelradius: {templateRadius}m</label>
                    <input type="range" min={100} max={1500} step={50} value={templateRadius} onChange={e => { setTemplateRadius(+e.target.value); setTemplateLocations([]) }} className="w-full" />
                  </div>

                  {templateLocations.length > 0 && (
                    <>
                      <div className="space-y-1">
                        {templateLocations.map(tl => {
                          const cfg = LOCATION_TYPE_CONFIG[tl.type]
                          return (
                            <div key={tl.tempId} className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                              <span className="text-base shrink-0">{cfg.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{tl.name}</p>
                                <p className="text-xs" style={{ color: 'var(--muted)' }}>{cfg.label} · +{tl.crown_value}👑/t</p>
                              </div>
                              <button onClick={() => setTemplateLocations(prev => prev.filter(t => t.tempId !== tl.tempId))}
                                className="text-xs px-1.5 py-0.5 rounded-lg shrink-0" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <button onClick={importTemplateLocations} disabled={templateImporting}
                          className="w-full py-3 font-black text-sm rounded-xl transition-all disabled:opacity-40 text-white"
                          style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 10px rgba(22,163,74,0.35)' }}>
                          {templateImporting ? 'Importeren...' : `✓ ${templateLocations.length} locaties importeren`}
                        </button>
                        <button onClick={() => setTemplateLocations([])} className="w-full py-1.5 text-xs font-medium" style={{ color: 'var(--dim)' }}>
                          ↩ Opnieuw genereren
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Home base panel */}
              {setupMode === 'homebase' && (
                <div className="p-3 space-y-2.5 text-sm">
                  <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>🏠 Centrale post</p>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Klik op de kaart om de centrale post in te stellen.</p>
                  {homeBase && (
                    <div className="p-3 rounded-xl" style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                      <p className="text-xs font-bold" style={{ color: '#d97706' }}>● Post ingesteld</p>
                      <p className="text-xs mt-1 font-mono" style={{ color: 'var(--muted)' }}>{homeBase.lat.toFixed(5)}, {homeBase.lng.toFixed(5)}</p>
                    </div>
                  )}
                  {homeBase && (
                    <button onClick={async () => {
                      setHomeBase(null)
                      const cfg = { ...(game?.config ?? {}), home_base: null }
                      await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: hostToken, config: cfg }) })
                      setSetupMode('list')
                    }} className="w-full py-2.5 font-bold text-sm rounded-xl transition-all" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                      Verwijderen
                    </button>
                  )}
                </div>
              )}

              {/* Geofence panel */}
              {setupMode === 'geofence' && (
                <div className="p-3 space-y-2.5 text-sm">
                  <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>◯ Speelzone</p>

                  <div className="flex gap-2">
                    {(['circle', 'polygon'] as const).map(m => (
                      <button key={m} onClick={() => { setGeofenceMode(m); setPendingPolygon([]) }}
                        className="flex-1 py-2 font-bold text-xs rounded-xl transition-all"
                        style={{ background: geofenceMode === m ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--surface2)', color: geofenceMode === m ? '#fff' : 'var(--muted)', boxShadow: geofenceMode === m ? '0 2px 6px rgba(245,158,11,0.3)' : undefined }}>
                        {m === 'circle' ? '◯ Cirkel' : '⬡ Polygoon'}
                      </button>
                    ))}
                  </div>

                  {geofenceMode === 'circle' && (
                    <>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>Klik op de kaart om het middelpunt te kiezen.</p>
                      <div>
                        <label className="block text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>Radius: {geofenceRadius}m</label>
                        <input type="range" min={200} max={5000} step={100} value={geofenceRadius} onChange={e => setGeofenceRadius(+e.target.value)} className="w-full" />
                      </div>
                    </>
                  )}

                  {geofenceMode === 'polygon' && (
                    <>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>Klik op de kaart om ankerpunten te plaatsen.</p>
                      {pendingPolygon.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{pendingPolygon.length} punten · {pendingPolygon.length >= 3 ? '✓ Gereed' : `nog ${3 - pendingPolygon.length} nodig`}</p>
                          <div className="flex gap-1.5">
                            <button onClick={() => setPendingPolygon(prev => prev.slice(0, -1))}
                              className="flex-1 py-2 font-bold text-xs rounded-xl transition-all" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--muted)' }}>
                              ← Undo
                            </button>
                            {pendingPolygon.length >= 3 && (
                              <button onClick={() => savePolygonGeofence(pendingPolygon)}
                                className="flex-1 py-2 font-bold text-xs rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                                ✓ Opslaan
                              </button>
                            )}
                          </div>
                          <button onClick={() => setPendingPolygon([])} className="w-full py-1 text-xs font-medium" style={{ color: 'var(--dim)' }}>Wissen</button>
                        </div>
                      )}
                    </>
                  )}

                  {geofence && (
                    <div className="p-3 rounded-xl" style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                      <p className="text-xs font-bold" style={{ color: '#16a34a' }}>● Zone actief</p>
                      {geofence.type === 'polygon'
                        ? <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Polygoon · {geofence.points.length} punten</p>
                        : <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Cirkel · {geofence.radius_meters}m</p>
                      }
                    </div>
                  )}
                  {geofence && (
                    <button onClick={async () => {
                      const token = localStorage.getItem('host_token') ?? hostToken
                      const savedGeofence = geofence
                      setGeofence(null); setPendingPolygon([])
                      const cfg = { ...(game?.config ?? {}), geofence: null }
                      const res = await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, config: cfg }) })
                      if (res.ok) { setSetupMode('list') } else {
                        const d = await res.json().catch(() => ({}))
                        setSavingStatus(`Verwijderen mislukt: ${d.error ?? ''}`)
                        setTimeout(() => setSavingStatus(''), 3000)
                        setGeofence(savedGeofence)
                      }
                    }} className="w-full py-2.5 font-bold text-sm rounded-xl transition-all" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                      Zone verwijderen
                    </button>
                  )}
                </div>
              )}

              {/* Story editor */}
              {setupMode === 'story' && (
                <div className="p-3 space-y-3 text-sm">
                  <p className="text-xs font-black tracking-widest pt-1" style={{ color: 'var(--muted)' }}>── VERHAALLIJN ──</p>

                  <div>
                    <p className="text-xs font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Verteller</p>
                    <div className="grid grid-cols-2 gap-1">
                      {NARRATOR_PRESETS.map(n => {
                        const isActive = storyNarratorId === n.id
                        return (
                          <button key={n.id} onClick={() => {
                            setStoryNarratorId(n.id)
                            if (storyChapters.length === 0 || confirm(`Standaard verhaal van ${n.name} laden? Huidige hoofdstukken worden vervangen.`)) {
                              setStoryChapters(n.defaultChapters)
                            }
                          }}
                            className="flex items-center gap-2 p-2.5 rounded-xl text-left transition-all"
                            style={{ background: isActive ? `${n.color}15` : 'var(--surface2)', border: `1.5px solid ${isActive ? n.color + '60' : 'var(--border)'}` }}>
                            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: n.color + '18', border: `1px solid ${n.color}30` }}>{n.emoji}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{n.name}</p>
                              <p className="mono text-[10px] truncate" style={{ color: 'var(--muted)' }}>{n.variant}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {(() => {
                      const active = NARRATOR_PRESETS.find(n => n.id === storyNarratorId)
                      return active ? (
                        <p className="text-[11px] italic mt-1.5 px-1" style={{ color: 'var(--muted)' }}>
                          {active.emoji} {active.tagline} — {active.variant}
                        </p>
                      ) : null
                    })()}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black tracking-widest" style={{ color: 'var(--muted)' }}>Hoofdstukken ({storyChapters.length})</p>
                      <button onClick={() => setShowStoryForm(v => !v)} className="text-xs font-bold" style={{ color: 'var(--blue)' }}>
                        {showStoryForm ? '✕ Sluiten' : '+ Toevoegen'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {storyChapters.map(ch => {
                        const tc = ch.trigger === 'game_start' ? '#16a34a' : ch.trigger === 'game_end' ? '#ef4444' : '#f59e0b'
                        const tl = ch.trigger === 'game_start' ? 'START' : ch.trigger === 'game_end' ? 'EINDE' : 'HANDM.'
                        return (
                          <div key={ch.id} className="flex items-start gap-1.5 p-2 rounded-xl group" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <span className="text-[11px] font-black px-1.5 py-0.5 rounded-lg shrink-0 mt-0.5" style={{ background: tc + '18', color: tc }}>{tl}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs truncate" style={{ color: 'var(--text)' }}>{ch.title}</p>
                              <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--muted)' }}>{ch.content}</p>
                            </div>
                            <button onClick={() => setStoryChapters(prev => prev.filter(c => c.id !== ch.id))}
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-xs px-1 transition-all" style={{ color: '#ef4444' }}>✕</button>
                          </div>
                        )
                      })}
                      {storyChapters.length === 0 && !showStoryForm && (
                        <p className="text-[11px] text-center py-4" style={{ color: 'var(--dim)' }}>── Geen hoofdstukken ──</p>
                      )}
                    </div>
                  </div>

                  {showStoryForm && (
                    <div className="space-y-2 p-2.5 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
                      <p className="text-xs font-black tracking-widest" style={{ color: 'var(--muted)' }}>Nieuw hoofdstuk</p>
                      <input placeholder="Titel" value={storyDraft.title} onChange={e => setStoryDraft(d => ({ ...d, title: e.target.value }))}
                        className="w-full px-3 py-2 text-xs outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', caretColor: 'var(--accent)' }} />
                      <textarea placeholder="Verhaal tekst..." value={storyDraft.content} onChange={e => setStoryDraft(d => ({ ...d, content: e.target.value }))}
                        rows={3} className="w-full px-3 py-2 text-xs outline-none resize-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', caretColor: 'var(--accent)' }} />
                      <select value={storyDraft.trigger} onChange={e => setStoryDraft(d => ({ ...d, trigger: e.target.value as StoryChapter['trigger'] }))}
                        className="w-full px-3 py-2 outline-none text-xs rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                        <option value="game_start">Bij start (intro)</option>
                        <option value="game_end">Bij einde (outro)</option>
                        <option value="manual">Handmatig</option>
                      </select>
                      <button onClick={() => {
                        if (!storyDraft.title.trim() || !storyDraft.content.trim()) return
                        setStoryChapters(prev => [...prev, { id: `ch-${Date.now()}`, ...storyDraft }])
                        setStoryDraft({ title: '', content: '', trigger: 'manual' })
                        setShowStoryForm(false)
                      }} disabled={!storyDraft.title.trim() || !storyDraft.content.trim()}
                        className="w-full py-2 font-black text-xs rounded-xl transition-all disabled:opacity-30 text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
                        + Toevoegen
                      </button>
                    </div>
                  )}

                  <button onClick={saveStory}
                    className="w-full py-2.5 font-black text-xs rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}>
                    Verhaal opslaan
                  </button>
                </div>
              )}

              {/* Location list */}
              {setupMode === 'list' && (
                <div className="p-3">

                  {/* Scheduled start */}
                  <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border2)' }}>
                    <p className="text-xs font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Gepland starttijdstip</p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="datetime-local"
                        value={scheduledStart}
                        onChange={e => setScheduledStart(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm outline-none rounded-xl"
                        style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}
                      />
                      <button
                        onClick={async () => {
                          const token = localStorage.getItem('host_token') ?? hostToken
                          const starts_at = scheduledStart ? new Date(scheduledStart).toISOString() : null
                          await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, starts_at }) })
                          setSavingStatus(starts_at ? '✅ Gepland' : '✅ Verwijderd')
                          setTimeout(() => setSavingStatus(''), 2000)
                        }}
                        className="px-3 py-2 font-bold text-xs rounded-xl text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 6px rgba(37,99,235,0.3)', whiteSpace: 'nowrap' }}>
                        Opslaan
                      </button>
                    </div>
                    {game.starts_at && (
                      <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
                        🕐 Start automatisch om {new Date(game.starts_at as string).toLocaleString('nl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {!scheduledStart && !game.starts_at && (
                      <p className="text-xs mt-1.5" style={{ color: 'var(--dim)' }}>Leeg laten = handmatig starten</p>
                    )}
                  </div>

                  {/* Groups section */}
                  <details className="mb-4 group" open={game.players.length === 0}>
                    <summary className="flex items-center justify-between cursor-pointer list-none mb-2">
                      <p className="text-xs font-black tracking-widest" style={{ color: 'var(--muted)' }}>Groepen ({game.players.length})</p>
                      <span className="text-xs group-open:rotate-180 transition-transform" style={{ color: 'var(--dim)' }}>▼</span>
                    </summary>

                    <div className="p-2.5 rounded-xl mb-2 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <div className="flex gap-1.5">
                        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Groepsnaam" maxLength={30}
                          className="flex-1 px-2.5 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', caretColor: 'var(--accent)' }} />
                        <input type="color" value={newGroupColor} onChange={e => setNewGroupColor(e.target.value)}
                          className="w-9 h-9 rounded-xl border cursor-pointer bg-transparent shrink-0" style={{ borderColor: 'var(--border)' }} />
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {[['#ef4444','Rood'],['#3b82f6','Blauw'],['#22c55e','Groen'],['#f59e0b','Geel'],['#8b5cf6','Paars'],['#f97316','Oranje'],['#ec4899','Roze'],['#06b6d4','Cyaan']].map(([c, label]) => (
                          <button key={c} onClick={() => { setNewGroupColor(c); setNewGroupName(prev => prev || label) }}
                            className="w-5 h-5 rounded-full border transition-all" style={{ background: c, borderColor: newGroupColor === c ? 'var(--text)' : 'transparent', transform: newGroupColor === c ? 'scale(1.2)' : 'scale(1)' }} title={label} />
                        ))}
                      </div>
                      <button onClick={async () => {
                        if (!newGroupName.trim()) return
                        const res = await fetch('/api/players', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ game_code: game.code, name: newGroupName.trim(), avatar: '🏕️', color: newGroupColor }) })
                        if (res.ok) { setNewGroupName(''); await fetchGame() }
                      }} disabled={!newGroupName.trim()}
                        className="w-full py-2 font-black text-xs rounded-xl transition-all disabled:opacity-30 text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
                        + Groep toevoegen
                      </button>
                    </div>

                    {game.players.length === 0 && (
                      <p className="text-[11px] text-center py-2" style={{ color: 'var(--dim)' }}>── Geen groepen ──</p>
                    )}
                    <div className="space-y-1.5">
                      {game.players.map(p => {
                        const playerJoinUrl = typeof window !== 'undefined'
                          ? `${window.location.origin}/join/${game.code}?group=${encodeURIComponent(p.name)}&color=${encodeURIComponent(p.color)}`
                          : `/join/${game.code}?group=${encodeURIComponent(p.name)}`
                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(playerJoinUrl)}`
                        const isShowingQr = showGroupQr === p.id
                        return (
                          <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                              <span className="font-bold text-sm flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                              <button onClick={() => setShowGroupQr(isShowingQr ? null : p.id)}
                                className="text-[11px] font-bold px-2 py-1 rounded-lg transition-all" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff' }}>
                                {isShowingQr ? 'Verberg' : 'QR'}
                              </button>
                            </div>
                            {isShowingQr && (
                              <div className="px-2.5 pb-2.5 flex gap-2.5 items-start" style={{ borderTop: '1px solid var(--border)' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qrUrl} alt={`QR ${p.name}`} width={80} height={80} className="rounded-xl shrink-0" style={{ background: 'white', padding: '4px' }} />
                                <div className="min-w-0 flex-1 pt-2">
                                  <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--muted)' }}>Scan als groep:</p>
                                  <p className="font-bold text-sm" style={{ color: p.color }}>{p.name}</p>
                                  <p className="text-[11px] mt-1 break-all leading-relaxed" style={{ color: 'var(--dim)' }}>{playerJoinUrl}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </details>

                  {/* Regions section */}
                  <details className="mb-4 group">
                    <summary className="flex items-center justify-between cursor-pointer list-none mb-2">
                      <p className="text-xs font-black tracking-widest" style={{ color: 'var(--muted)' }}>Regio&apos;s ({regions.length})</p>
                      <span className="text-xs group-open:rotate-180 transition-transform" style={{ color: 'var(--dim)' }}>▼</span>
                    </summary>

                    <div className="p-2.5 rounded-xl mb-2 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>Maak regio&apos;s aan en ken ze toe aan locaties. Volledige controle over een regio geeft +25% inkomen.</p>
                      <div className="flex gap-1.5">
                        <input value={newRegionName} onChange={e => setNewRegionName(e.target.value)} placeholder="Naam regio" maxLength={30}
                          className="flex-1 px-2.5 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', caretColor: 'var(--accent)' }} />
                        <input type="color" value={newRegionColor} onChange={e => setNewRegionColor(e.target.value)}
                          className="w-9 h-9 rounded-xl border cursor-pointer bg-transparent shrink-0" style={{ borderColor: 'var(--border)' }} />
                      </div>
                      <button onClick={async () => {
                        if (!newRegionName.trim()) return
                        const token = localStorage.getItem('host_token') ?? hostToken
                        const res = await fetch('/api/regions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ host_token: token, game_id: gameId, name: newRegionName.trim(), color: newRegionColor }) })
                        if (res.ok) { setNewRegionName(''); await fetchRegions() }
                      }} disabled={!newRegionName.trim()}
                        className="w-full py-2 font-black text-xs rounded-xl transition-all disabled:opacity-30 text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
                        + Regio toevoegen
                      </button>
                    </div>

                    {regions.length === 0 && (
                      <p className="text-[11px] text-center py-2" style={{ color: 'var(--dim)' }}>── Geen regio&apos;s ──</p>
                    )}
                    <div className="space-y-1.5">
                      {regions.map(r => {
                        const locs = game.locations.filter(l => (l as Location & { region_id?: string | null }).region_id === r.id)
                        return (
                          <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <input type="color" value={r.color} title="Kleur wijzigen"
                              onChange={async e => {
                                const token = localStorage.getItem('host_token') ?? hostToken
                                await fetch(`/api/regions/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ host_token: token, color: e.target.value }) })
                                await fetchRegions()
                              }}
                              className="w-6 h-6 rounded-full border-0 cursor-pointer shrink-0 p-0"
                              style={{ background: 'none' }} />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{locs.length} locatie{locs.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={async () => {
                              if (!confirm(`Regio "${r.name}" verwijderen?`)) return
                              const token = localStorage.getItem('host_token') ?? hostToken
                              await fetch(`/api/regions/${r.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token }) })
                              await Promise.all([fetchRegions(), fetchGame()])
                            }} className="text-xs px-2 py-1 rounded-lg transition-all" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  </details>

                  <p className="text-xs font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Locaties ({game.locations.length})</p>

                  {/* Location count advice */}
                  {(() => {
                    const playerCount = game.players.filter(p => p.is_active).length || game.players.length
                    const groupCount = alliances.length > 0 ? alliances.length : null
                    const units = groupCount ?? playerCount
                    const unitLabel = groupCount ? `${groupCount} groepen` : `${playerCount} spelers`
                    const minLoc = Math.max(8, units * 3)
                    const maxLoc = units * 5
                    const current = game.locations.length
                    const ok = current >= minLoc
                    const tooMany = current > maxLoc + 4
                    if (units === 0) return null
                    const borderColor = tooMany ? 'var(--amber)' : ok ? 'var(--border2)' : '#78350f'
                    const textColor = tooMany ? 'var(--amber)' : ok ? 'var(--accent)' : 'var(--amber)'
                    return (
                      <div className="mb-3 p-2.5 rounded-xl" style={{ background: 'var(--surface2)', border: `1px solid ${borderColor}` }}>
                        <p className="mono text-[11px] font-bold tracking-widest mb-1" style={{ color: textColor }}>
                          {tooMany ? '⚠ VEEL LOCATIES' : ok ? '◉ GOED AANTAL' : '◎ ADVIES'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {unitLabel}: adviseer {minLoc}–{maxLoc} locaties.{!ok && ` Voeg ${minLoc - current} toe.`}{ok && !tooMany && ' Je zit goed.'}
                        </p>
                      </div>
                    )
                  })()}

                  {game.locations.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--dim)' }}>Gebruik de kaarttools om locaties toe te voegen</p>}
                  {game.locations.map(loc => {
                    const cfg = LOCATION_TYPE_CONFIG[loc.type as LocationType]
                    const owner = game.location_ownership.find(o => o.location_id === loc.id)
                    const locRegionId = (loc as Location & { region_id?: string | null }).region_id ?? ''
                    const locRegion = regions.find(r => r.id === locRegionId)
                    return (
                      <div key={loc.id} className="rounded-xl group overflow-hidden" style={{ background: 'var(--surface)', border: `1px solid ${locRegion ? locRegion.color + '40' : 'transparent'}` }}>
                        <div onClick={() => setupMapRef.current?.flyTo([loc.lat, loc.lng], 17)} className="flex items-center justify-between px-2 py-2 cursor-pointer transition-all"
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div className="flex gap-2 min-w-0 items-center">
                            <span className="text-base shrink-0">{cfg.emoji}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{loc.name}</p>
                                {locRegion && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg shrink-0" style={{ background: locRegion.color + '22', color: locRegion.color }}>{locRegion.name}</span>}
                              </div>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{cfg.label} · +{loc.crown_value}/t</p>
                              {owner && <p className="text-xs font-bold mt-0.5" style={{ color: owner.player?.color }}>● {owner.player?.name}</p>}
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); deleteLocation(loc.id) }} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded-lg transition-all" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</button>
                        </div>
                        {regions.length > 0 && (
                          <div className="px-2 pb-2" onClick={e => e.stopPropagation()}>
                            <select
                              value={locRegionId}
                              onChange={async e => {
                                const token = localStorage.getItem('host_token') ?? hostToken
                                await fetch(`/api/locations/${loc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ host_token: token, region_id: e.target.value || null }) })
                                await fetchGame()
                              }}
                              className="w-full px-2 py-1.5 text-xs outline-none rounded-xl"
                              style={{ background: 'var(--surface2)', border: `1.5px solid ${locRegion ? locRegion.color + '60' : 'var(--border)'}`, color: 'var(--muted)' }}>
                              <option value="">── Geen regio ──</option>
                              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMMAND TAB ── kaart + gecombineerd paneel */}
        {tab === 'command' && (
          <div className="h-full flex">
            {/* Map — neemt beschikbare breedte */}
            <div className="flex-1 relative min-w-0">
              <HostMap locations={game.locations} ownership={game.location_ownership} players={game.players} regions={regions} addingMode={false} onMapClick={() => {}} pendingLocation={null} onDeleteLocation={() => {}} liveMode geofence={geofence} initialCenter={initialCenter} homeBase={homeBase} />
            </div>

            {/* Right command panel */}
            <div className="w-80 shrink-0 flex flex-col" style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)' }}>
              {/* Sub-nav */}
              <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                {([
                  ['scores',  '▲', 'SCORES'],
                  ['fase',    '»', 'FASE'],
                  ['events',  '📡', 'EVENTS'],
                  ['spelers', '◉', 'SPELERS'],
                  ['powerups','⚡', 'QR'],
                  ['fotos',   '📸', 'FOTOS'],
                  ['allianties','🤝','ALLIES'],
                ] as [CommandPanel, string, string][]).map(([p, icon, label]) => (
                  <button key={p} onClick={() => setCommandPanel(p)} title={label}
                    className="flex-1 py-1.5 rounded-lg mono font-bold text-xs transition-all"
                    style={{ background: commandPanel === p ? hostNarratorColor : 'var(--surface2)', color: commandPanel === p ? '#fff' : 'var(--dim)', boxShadow: commandPanel === p ? `0 2px 6px ${hostNarratorColor}44` : undefined }}>
                    {icon}
                  </button>
                ))}
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">

                {/* SCORES */}
                {commandPanel === 'scores' && (
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <p className="font-black text-sm" style={{ color: 'var(--text)' }}>🏆 Live ranglijst</p>
                      {game.status === 'active' && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={manualTick} className="font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all" style={{ background: '#f59e0b', color: '#fff', boxShadow: '0 2px 6px rgba(245,158,11,0.4)' }}>👑</button>
                          <button onClick={() => setAutoTickEnabled(v => !v)} className="font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all"
                            style={{ background: autoTickEnabled ? '#22c55e' : 'var(--surface2)', color: autoTickEnabled ? '#fff' : 'var(--muted)', border: `1.5px solid ${autoTickEnabled ? '#22c55e' : 'var(--border)'}` }}>
                            {autoTickEnabled ? `⏱ ${autoTickInterval}m` : '⏱ Auto'}
                          </button>
                          {autoTickEnabled && (
                            <input type="number" min={1} max={10} value={autoTickInterval} onChange={e => setAutoTickInterval(Math.max(1, +e.target.value))}
                              className="w-10 text-center text-xs font-bold rounded-lg outline-none" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', padding: '4px 2px' }} />
                          )}
                        </div>
                      )}
                    </div>
                    {game.players.sort((a, b) => b.crowns - a.crowns).map((p, i) => {
                      const owned = game.location_ownership.filter(o => o.player_id === p.id).length
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: i === 0 ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : 'var(--surface2)', border: `1.5px solid ${i === 0 ? '#fde68a' : 'var(--border)'}` }}>
                          <span className="font-black text-xs w-5 shrink-0 text-center" style={{ color: i === 0 ? '#d97706' : i < 3 ? 'var(--muted)' : 'var(--dim)' }}>{['🥇','🥈','🥉'][i] ?? i + 1}</span>
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: p.color + '20', border: `2px solid ${p.color}` }}>{(p as Player & { avatar?: string }).avatar ?? p.name[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>{owned} posts</p>
                          </div>
                          <span className="font-black text-sm tabular-nums shrink-0 px-2 py-0.5 rounded-lg" style={{ background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--surface3)', color: i === 0 ? '#fff' : 'var(--amber)' }}>{p.crowns}👑</span>
                        </div>
                      )
                    })}
                    {game.players.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--dim)' }}>Wacht op spelers…</p>}

                    {/* Region control */}
                    {regions.length > 0 && (
                      <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                        <p className="mono text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>REGIO&apos;S</p>
                        <div className="space-y-1">
                          {regions.map(r => {
                            const regionLocs = game.locations.filter(l => (l as Location & { region_id?: string | null }).region_id === r.id)
                            const total = regionLocs.length
                            const playerCounts: Record<string, number> = {}
                            for (const loc of regionLocs) {
                              const owner = game.location_ownership.find(o => o.location_id === loc.id)
                              if (owner) playerCounts[owner.player_id] = (playerCounts[owner.player_id] ?? 0) + 1
                            }
                            const controllerId = total > 0 ? (Object.entries(playerCounts).find(([, c]) => c >= total)?.[0] ?? null) : null
                            const controller = controllerId ? game.players.find(p => p.id === controllerId) : null
                            const claimed = Object.values(playerCounts).reduce((a, b) => a + b, 0)
                            return (
                              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl" style={{ background: controller ? r.color + '12' : 'var(--surface2)', border: `1px solid ${controller ? r.color + '40' : 'var(--border)'}` }}>
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                                <p className="text-xs font-bold flex-1 truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
                                <p className="text-xs tabular-nums shrink-0" style={{ color: 'var(--muted)' }}>{claimed}/{total}</p>
                                {controller && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg shrink-0" style={{ background: controller.color + '20', color: controller.color }}>{controller.name}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* FASE */}
                {commandPanel === 'fase' && (
                  <div className="p-3 space-y-2">
                    <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>» Fasebeheer</p>
                    {(() => {
                      const cfg = game.config as Record<string, unknown>
                      const gamPhases = (cfg.phases ?? phases) as GamePhase[]
                      const curIdx = (game as Game & { current_phase?: number }).current_phase ?? 0
                      return (
                        <>
                          <div className="space-y-1.5">
                            {gamPhases.map((ph, i) => (
                              <div key={i} className="p-2.5 rounded-xl transition-all"
                                style={{ background: i === curIdx ? '#eff6ff' : 'var(--surface2)', border: `1.5px solid ${i === curIdx ? '#bfdbfe' : 'var(--border)'}`, opacity: i < curIdx ? 0.45 : 1 }}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-black text-xs w-5 h-5 rounded-lg flex items-center justify-center shrink-0" style={{ background: i < curIdx ? '#22c55e' : i === curIdx ? '#2563eb' : 'var(--surface3)', color: i <= curIdx ? '#fff' : 'var(--dim)' }}>{i < curIdx ? '✓' : i + 1}</span>
                                  <span className="font-bold text-xs" style={{ color: i === curIdx ? '#2563eb' : 'var(--muted)' }}>{ph.name}</span>
                                  {i === curIdx && <span className="font-bold text-xs ml-auto px-2 py-0.5 rounded-lg blink" style={{ background: '#2563eb', color: '#fff' }}>Actief</span>}
                                </div>
                                <p className="text-xs ml-7" style={{ color: 'var(--dim)' }}>Zone {Math.round(ph.zone_factor * 100)}% · {ph.duration_minutes}min · {ph.crown_penalty_per_tick > 0 ? `−${ph.crown_penalty_per_tick}👑 straf` : 'geen straf'}</p>
                              </div>
                            ))}
                          </div>
                          {curIdx < gamPhases.length - 1 && game.status === 'active' && (
                            <button onClick={nextPhase} className="w-full py-2.5 font-black text-sm rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', boxShadow: '0 2px 8px rgba(245,158,11,0.35)' }}>
                              Fase {curIdx + 2}: {gamPhases[curIdx + 1]?.name} →
                            </button>
                          )}
                          <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                            <button onClick={clusterRegions} className="w-full py-2.5 font-bold text-sm rounded-xl transition-all" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--muted)' }}>Auto-groepeer regio&apos;s</button>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* EVENTS */}
                {commandPanel === 'events' && (
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between pt-1 mb-1">
                      <p className="font-black text-sm" style={{ color: 'var(--text)' }}>📡 Operaties</p>
                      <button onClick={fetchTimeline} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>↺ Ververs</button>
                    </div>

                    {/* Activiteitsfeed */}
                    {timeline.length > 0 && (
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer list-none py-1">
                          <p className="mono text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>📋 ACTIVITEIT ({timeline.length})</p>
                          <span className="text-xs group-open:rotate-180 transition-transform" style={{ color: 'var(--dim)' }}>▼</span>
                        </summary>
                        <div className="space-y-1 mt-1.5 max-h-52 overflow-y-auto">
                          {timeline.map(ev => {
                            const evPlayer = game.players.find(p => p.id === ev.player_id)
                            const d = ev.data as Record<string, unknown>
                            const typeIcon: Record<string, string> = {
                              location_claimed: '🏴', encounter_resolved: '⚔️', crown_tick: '👑',
                              phase_change: '⚔', admin_event: '📡', powerup_claimed: '⚡',
                              storm: '🌩️', crown_rain: '◈', story: '📖', player_kicked: '🚫',
                            }
                            const icon = typeIcon[ev.type] ?? '●'
                            const timeStr = new Date(ev.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                            let summary = ev.type
                            if (ev.type === 'location_claimed') summary = `${evPlayer?.name ?? '?'} nam ${(d.location_name as string) ?? '?'} in`
                            else if (ev.type === 'encounter_resolved') summary = `Gevecht beëindigd${d.winner_id ? '' : ' (gelijkspel)'}`
                            else if (ev.type === 'crown_tick') summary = `Inning — ${Object.keys(d.payouts as object).length} spelers`
                            else if (ev.type === 'phase_change') summary = `Fase: ${(d.phase_name as string) ?? '?'}`
                            else if (ev.type === 'admin_event') summary = (d.title as string) ?? 'Admin event'
                            else if (ev.type === 'storm') summary = 'Veldslag — gebieden neutraal'
                            else if (ev.type === 'crown_rain') summary = 'Schatkistuitdeling'
                            return (
                              <div key={ev.id} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                                <span className="text-sm shrink-0">{icon}</span>
                                <p className="text-[11px] flex-1 truncate" style={{ color: 'var(--text)' }}>{summary}</p>
                                <span className="mono text-[10px] shrink-0" style={{ color: 'var(--dim)' }}>{timeStr}</span>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    )}

                    {/* Auto-advies */}
                    {game.status === 'active' && (() => {
                      const totalLocs = game.locations.length
                      if (totalLocs === 0 || game.players.length < 2) return null
                      const advice: Array<{
                        id: string; icon: string; title: string
                        rationale: string; effect: string; severity: 'medium' | 'high'
                        onAccept: () => void
                      }> = []

                      const ownedByPlayer = game.players.map(p => ({
                        ...p, owned: game.location_ownership.filter(o => o.player_id === p.id).length,
                      })).sort((a, b) => b.owned - a.owned)
                      const leader = ownedByPlayer[0]
                      const leaderPct = Math.round((leader.owned / totalLocs) * 100)
                      if (leaderPct >= 55) {
                        advice.push({
                          id: 'storm',
                          icon: '🌩️',
                          title: 'Veldslag aanbevolen',
                          rationale: `${leader.name} bezit ${leader.owned}/${totalLocs} locaties (${leaderPct}%)`,
                          effect: 'Alle gebieden worden neutraal — achterliggende teams krijgen een kans',
                          severity: 'high',
                          onAccept: () => sendAdminEventRaw('storm', 'Veldslag!', 'Alle gebieden zijn neutraal verklaard!', {}, null, null),
                        })
                      }

                      const sortedByCrowns = [...game.players].sort((a, b) => b.crowns - a.crowns)
                      const top = sortedByCrowns[0], last = sortedByCrowns[sortedByCrowns.length - 1]
                      if (top.crowns > 0 && last.crowns >= 0 && top.crowns >= last.crowns * 3 + 30) {
                        advice.push({
                          id: 'crown_rain',
                          icon: '👑',
                          title: 'Schatkistuitdeling aanbevolen',
                          rationale: `${top.name} heeft ${top.crowns}👑 — ${last.name} heeft ${last.crowns}👑`,
                          effect: 'Alle spelers ontvangen direct kronen — achterstand wordt kleiner',
                          severity: 'medium',
                          onAccept: () => sendAdminEventRaw('crown_rain', 'Schatkistuitdeling!', 'De schatkist wordt uitgedeeld aan alle ridders!', { amount: 30 }, null, null),
                        })
                      }

                      const claimedCount = game.location_ownership.length
                      const unclaimedPct = Math.round(((totalLocs - claimedCount) / totalLocs) * 100)
                      if (unclaimedPct >= 45) {
                        advice.push({
                          id: 'double_crowns',
                          icon: '💎',
                          title: 'Weelde aanbevolen',
                          rationale: `${totalLocs - claimedCount} van ${totalLocs} locaties zijn onbezet (${unclaimedPct}%)`,
                          effect: 'Dubbele inkomsten voor 5 min — stimuleert veroveringsactiviteit',
                          severity: 'medium',
                          onAccept: () => sendAdminEventRaw('double_crowns', 'Weelde!', 'Dubbele inkomsten voor alle ridders!', { amount: 50 }, 5, null),
                        })
                      }

                      const visible = advice.filter(a => !dismissedAdvice.has(a.id))
                      if (visible.length === 0) return null
                      return (
                        <div className="space-y-2 pb-1">
                          <p className="mono text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>💡 TACTISCH ADVIES</p>
                          {visible.map(a => (
                            <div key={a.id} className="rounded-2xl overflow-hidden slide-up"
                              style={{ background: a.severity === 'high' ? 'linear-gradient(135deg,#450a0a,#7f1d1d)' : 'linear-gradient(135deg,#1e293b,#0f172a)', border: `1.5px solid ${a.severity === 'high' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.1)'}` }}>
                              <div className="px-3 pt-3 pb-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xl">{a.icon}</span>
                                  <p className="font-black text-sm" style={{ color: a.severity === 'high' ? '#fca5a5' : '#e2e8f0' }}>{a.title}</p>
                                </div>
                                <p className="text-xs mb-1" style={{ color: a.severity === 'high' ? '#fca5a5' : '#94a3b8' }}>
                                  <span className="font-bold" style={{ color: a.severity === 'high' ? '#f87171' : '#64748b' }}>Reden: </span>{a.rationale}
                                </p>
                                <p className="text-xs" style={{ color: a.severity === 'high' ? '#fca5a5' : '#94a3b8' }}>
                                  <span className="font-bold" style={{ color: a.severity === 'high' ? '#f87171' : '#64748b' }}>Effect: </span>{a.effect}
                                </p>
                              </div>
                              <div className="flex border-t" style={{ borderColor: a.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)' }}>
                                <button onClick={() => { a.onAccept(); setDismissedAdvice(prev => new Set([...prev, a.id])) }}
                                  className="flex-1 py-2 font-black text-xs tracking-wide transition-all"
                                  style={{ background: a.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)', color: a.severity === 'high' ? '#f87171' : '#94a3b8', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                                  ✓ Activeer
                                </button>
                                <button onClick={() => setDismissedAdvice(prev => new Set([...prev, a.id]))}
                                  className="flex-1 py-2 font-bold text-xs transition-all"
                                  style={{ color: '#475569' }}>
                                  ✗ Negeer
                                </button>
                              </div>
                            </div>
                          ))}
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px' }} />
                        </div>
                      )
                    })()}
                    {game.status === 'ended' && (
                      <button onClick={restartGame} className="w-full py-2.5 font-black text-sm rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>↺ Nieuwe ronde</button>
                    )}

                    {storyChapters.length > 0 && (
                      <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                        <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Verhaalstukken</p>
                        {storyChapters.map(ch => (
                          <div key={ch.id} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{ch.title}</p>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{ch.trigger === 'game_start' ? '▶ Start' : ch.trigger === 'game_end' ? '■ Einde' : '↗ Handmatig'}</p>
                            </div>
                            <button onClick={() => dispatchStoryChapter(ch, storyNarratorId).then(() => { setSavingStatus('Verstuurd'); setTimeout(() => setSavingStatus(''), 2000) })}
                              className="shrink-0 font-bold text-xs px-2.5 py-1.5 rounded-lg transition-all text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
                              Stuur →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5">
                      {ADMIN_EVENT_TEMPLATES.map(t => (
                        <button key={t.type}
                          onClick={() => {
                            setEventForm(f => ({ ...f, type: t.type, title: t.label, location_id: '' }))
                            const needsPicker = ['location_boost', 'bonus_mission'].includes(t.type)
                            if (!needsPicker && t.type !== 'announcement') {
                              const value = ['crown_rain', 'double_crowns'].includes(t.type) ? { amount: parseInt(eventForm.amount) } : {}
                              const expires = t.type === 'double_crowns' ? 5 : null
                              sendAdminEventRaw(t.type, t.label, t.description, value, expires, null)
                            }
                          }}
                          className="flex items-center gap-1.5 p-2.5 rounded-xl text-left transition-all"
                          style={{ background: eventForm.type === t.type ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'var(--surface2)', border: `1.5px solid ${eventForm.type === t.type ? '#93c5fd' : 'var(--border)'}` }}>
                          <span className="text-base">{t.emoji}</span>
                          <span className="font-bold text-xs leading-tight" style={{ color: 'var(--text)' }}>{t.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-center" style={{ color: 'var(--dim)' }}>Storm/regen direct · aankondiging/boost/missie vragen opties</p>

                    {eventForm.type === 'announcement' && (
                      <>
                        <input placeholder="Aankondiging..." value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                          className="w-full px-3 py-2.5 text-sm outline-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border2)', color: 'var(--text)' }} />
                        <textarea placeholder="Toelichting (optioneel)" value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                          rows={2} className="w-full px-3 py-2 text-sm outline-none resize-none rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                        <select value={eventForm.target_player_id} onChange={e => setEventForm(f => ({ ...f, target_player_id: e.target.value }))}
                          className="w-full px-3 py-2 outline-none text-sm rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                          <option value="">Alle spelers</option>
                          {game.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button onClick={sendAdminEvent} disabled={!eventForm.title} className="w-full py-3 font-black text-sm rounded-xl transition-all disabled:opacity-40 text-white" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', boxShadow: '0 2px 8px rgba(245,158,11,0.35)' }}>
                          📡 {eventForm.target_player_id ? `→ ${game.players.find(p => p.id === eventForm.target_player_id)?.name}` : 'Verstuur naar iedereen'}
                        </button>
                      </>
                    )}

                    {(eventForm.type === 'location_boost' || eventForm.type === 'bonus_mission') && (
                      <div className="space-y-2 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                        <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{eventForm.type === 'location_boost' ? '⚡ 3× inkomen · 15 min' : '🎯 Eerste claim wint bonus'}</p>
                        <select value={eventForm.location_id} onChange={e => setEventForm(f => ({ ...f, location_id: e.target.value }))}
                          className="w-full px-3 py-2 outline-none text-sm rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                          <option value="">— Kies post —</option>
                          {game.locations.map(l => {
                            const cfg = LOCATION_TYPE_CONFIG[l.type as LocationType]
                            return <option key={l.id} value={l.id}>{cfg.emoji} {l.name}</option>
                          })}
                        </select>
                        {eventForm.type === 'bonus_mission' && (
                          <div className="flex items-center gap-2 text-sm">
                            <label className="text-xs font-bold shrink-0" style={{ color: 'var(--muted)' }}>Beloning:</label>
                            <input type="number" value={eventForm.amount} onChange={e => setEventForm(f => ({ ...f, amount: e.target.value }))}
                              className="w-20 px-2 py-1.5 outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                            <span style={{ color: 'var(--amber)' }}>👑</span>
                          </div>
                        )}
                        <button onClick={sendAdminEvent} disabled={!eventForm.location_id}
                          className="w-full py-3 font-black text-sm rounded-xl transition-all disabled:opacity-40 text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                          {eventForm.type === 'location_boost' ? '⚡ Activeer' : '🎯 Start missie'}
                        </button>
                      </div>
                    )}

                    <div className="pt-1.5 space-y-1 max-h-36 overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
                      {adminEvents.slice(0, 10).map(ev => {
                        const tmpl = ADMIN_EVENT_TEMPLATES.find(t => t.type === ev.type)
                        return (
                          <div key={ev.id} className="flex gap-2 mono text-[11px] py-0.5" style={{ color: 'var(--muted)' }}>
                            <span>{tmpl?.emoji ?? '📡'}</span>
                            <span className="flex-1 truncate">{ev.title}</span>
                            <span className="shrink-0 tabular-nums">{new Date(ev.created_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* SPELERS */}
                {commandPanel === 'spelers' && (
                  <div className="p-3 space-y-1.5">
                    <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>◉ Deelnemers</p>
                    {game.players.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'var(--dim)' }}>Geen spelers</p>}
                    {game.players.sort((a, b) => b.crowns - a.crowns).map((player, i) => {
                      const ownedCount = game.location_ownership.filter(o => o.player_id === player.id).length
                      return (
                        <div key={player.id} className="rounded-xl p-2.5 space-y-2" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs w-5 text-center" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: player.color + '20', border: `2px solid ${player.color}` }}>{(player as Player & { avatar?: string }).avatar ?? player.name[0]}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{player.name}</p>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{ownedCount} posts · <span style={{ color: player.is_active ? 'var(--accent)' : 'var(--dim)' }}>{player.is_active ? 'Actief' : 'Inactief'}</span></p>
                            </div>
                            <span className="font-black text-sm shrink-0 px-2 py-0.5 rounded-lg" style={{ background: 'var(--surface3)', color: 'var(--amber)' }}>{player.crowns}👑</span>
                          </div>
                          <div className="flex gap-1.5">
                            <input placeholder="Reden..." value={kickReason[player.id] ?? ''} onChange={e => setKickReason(r => ({ ...r, [player.id]: e.target.value }))}
                              className="flex-1 px-2.5 py-1.5 text-xs outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                            <button onClick={() => kickPlayer(player.id)} disabled={!kickReason[player.id]?.trim()}
                              className="px-3 py-1.5 font-bold text-xs rounded-xl transition-all disabled:opacity-25" style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fca5a5' }}>Kick</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* POWERUPS */}
                {commandPanel === 'powerups' && (
                  <div className="p-3 space-y-2">
                    <p className="font-black text-sm pt-1" style={{ color: 'var(--text)' }}>⚡ QR Codes</p>
                    <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                      <select value={powerupForm.type} onChange={e => { const t = e.target.value as PowerupType; setPowerupForm(f => ({ ...f, type: t, emoji: POWERUP_CONFIG[t].emoji })) }}
                        className="w-full px-3 py-2.5 outline-none rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                        {(Object.entries(POWERUP_CONFIG) as [PowerupType, typeof POWERUP_CONFIG[PowerupType]][]).map(([k, v]) => (
                          <option key={k} value={k}>{v.emoji} {v.label}</option>
                        ))}
                      </select>
                      {powerupForm.type === 'crowns_bonus' && (
                        <input type="number" placeholder="Kronen" value={powerupForm.amount} onChange={e => setPowerupForm(f => ({ ...f, amount: e.target.value }))}
                          className="w-full px-3 py-2.5 outline-none rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                      )}
                      <div className="flex items-center gap-2 text-xs">
                        <input type="checkbox" id="sec-loc" checked={powerupForm.is_secret_location} onChange={e => setPowerupForm(f => ({ ...f, is_secret_location: e.target.checked }))} />
                        <label htmlFor="sec-loc" className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Geheime locatie</label>
                      </div>
                      <button onClick={createPowerup} className="w-full py-2.5 font-black text-sm rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>+ Aanmaken</button>
                    </div>
                    <div className="space-y-1.5">
                      {powerups.map(p => {
                        const scanUrl = typeof window !== 'undefined' ? `${window.location.origin}/scan/${p.token}` : `/scan/${p.token}`
                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(scanUrl)}`
                        return (
                          <div key={p.id} className="flex gap-2.5 rounded-xl p-3" style={{ background: 'var(--surface2)', border: `1.5px solid ${p.claimed_by ? '#bbf7d0' : 'var(--border)'}` }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrUrl} alt={p.token} width={56} height={56} className="rounded-xl shrink-0" style={{ background: 'white', padding: '3px' }} />
                            <div className="min-w-0">
                              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{p.emoji} {p.label}</p>
                              <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--dim)' }}>{p.token}</p>
                              <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: p.claimed_by ? '#f0fdf4' : 'var(--surface3)', color: p.claimed_by ? '#16a34a' : 'var(--muted)' }}>
                                {p.claimed_by ? '✓ Geclaimd' : '◎ Beschikbaar'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {powerups.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--dim)' }}>Geen QR codes</p>}
                    </div>
                  </div>
                )}

                {/* FOTOS */}
                {commandPanel === 'fotos' && (
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between pt-1">
                      <p className="font-black text-sm" style={{ color: 'var(--text)' }}>📸 Foto inzendingen</p>
                      <button onClick={fetchPendingPhotos} className="font-bold text-xs px-2.5 py-1.5 rounded-lg" style={{ background: '#eff6ff', color: '#2563eb' }}>↺ Laden</button>
                    </div>
                    {pendingPhotos.length === 0 && (
                      <p className="text-sm text-center py-8" style={{ color: 'var(--dim)' }}>Geen inzendingen</p>
                    )}
                    {pendingPhotos.map(ev => {
                      const d = ev.data as Record<string, unknown>
                      const status = photoActionStatus[ev.id]
                      return (
                        <div key={ev.id} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{d.player_name as string}</p>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>📍 {d.location_name as string}</p>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--dim)' }}>{new Date(ev.created_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          {Boolean(d.photo_prompt) && <p className="text-xs italic" style={{ color: 'var(--muted)' }}>{String(d.photo_prompt)}</p>}
                          {Boolean(d.answer) && (
                            String(d.answer).startsWith('http')
                              ? <img src={String(d.answer)} alt="inzending" className="w-full rounded-xl object-cover" style={{ maxHeight: '200px' }} />
                              : <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>&ldquo;{String(d.answer)}&rdquo;</p>
                          )}
                          {status ? (
                            <p className="text-xs text-center font-medium" style={{ color: 'var(--muted)' }}>{status}</p>
                          ) : (
                            <div className="flex gap-1.5 pt-0.5">
                              <button onClick={async () => {
                                const token = localStorage.getItem('host_token') ?? hostToken
                                const res = await fetch('/api/photo-approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, event_id: ev.id, approved: true }) })
                                if (res.ok) { setPhotoActionStatus(s => ({ ...s, [ev.id]: 'Goedgekeurd' })); await fetchPendingPhotos() }
                              }} className="flex-1 py-2 font-bold text-sm rounded-xl transition-all text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 6px rgba(22,163,74,0.3)' }}>✓ OK</button>
                              <button onClick={async () => {
                                const token = localStorage.getItem('host_token') ?? hostToken
                                const res = await fetch('/api/photo-approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, event_id: ev.id, approved: false }) })
                                if (res.ok) { setPhotoActionStatus(s => ({ ...s, [ev.id]: 'Afgekeurd' })); await fetchPendingPhotos() }
                              }} className="flex-1 py-2 font-bold text-sm rounded-xl transition-all" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>✗ Af</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ALLIANTIES */}
                {commandPanel === 'allianties' && (
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-black tracking-widest pt-1" style={{ color: 'var(--muted)' }}>── ALLIANTIES ──</p>
                    <div className="p-2.5 rounded-xl space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <div className="flex gap-1.5">
                        <input value={newAllianceName} onChange={e => setNewAllianceName(e.target.value)} placeholder="Naam..." maxLength={20}
                          className="flex-1 px-2.5 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', caretColor: 'var(--accent)' }} />
                        <input type="color" value={newAllianceColor} onChange={e => setNewAllianceColor(e.target.value)}
                          className="w-9 h-9 rounded-xl border cursor-pointer bg-transparent" style={{ borderColor: 'var(--border)' }} />
                      </div>
                      <button onClick={async () => {
                        if (!newAllianceName.trim()) return
                        const token = localStorage.getItem('host_token') ?? hostToken
                        const res = await fetch('/api/alliances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, name: newAllianceName.trim(), color: newAllianceColor }) })
                        if (res.ok) { setNewAllianceName(''); await fetchAlliances() }
                      }} disabled={!newAllianceName.trim()}
                        className="w-full py-2 font-black text-xs rounded-xl transition-all disabled:opacity-30 text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                        + Aanmaken
                      </button>
                    </div>

                    {alliances.length === 0 && <p className="text-[11px] text-center py-6" style={{ color: 'var(--dim)' }}>── Geen allianties ──</p>}
                    {alliances.map(al => {
                      const members = game.players.filter(p => p.alliance_id === al.id)
                      const nonMembers = game.players.filter(p => !p.alliance_id || p.alliance_id !== al.id)
                      return (
                        <div key={al.id} className="rounded-xl p-2.5 space-y-2" style={{ background: 'var(--surface2)', border: `1px solid ${al.color}40` }}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: al.color }} />
                            <span className="font-bold text-sm flex-1" style={{ color: 'var(--text)' }}>{al.name}</span>
                            <button onClick={async () => {
                              const token = localStorage.getItem('host_token') ?? hostToken
                              await fetch('/api/alliances', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, alliance_id: al.id }) })
                              await fetchAlliances()
                            }} className="text-[11px] px-1.5 py-0.5 rounded-lg transition-all" style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fca5a5' }}>✕</button>
                          </div>
                          {members.length > 0 && (
                            <div className="space-y-1">
                              {members.map(p => (
                                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                  <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                  <span className="text-xs flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                                  <button onClick={async () => {
                                    const token = localStorage.getItem('host_token') ?? hostToken
                                    await fetch('/api/alliances/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, player_id: p.id, alliance_id: null }) })
                                    await fetchAlliances(); await fetchGame()
                                  }} className="text-[11px]" style={{ color: 'var(--dim)' }}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {nonMembers.length > 0 && (
                            <select onChange={async e => {
                              if (!e.target.value) return
                              const token = localStorage.getItem('host_token') ?? hostToken
                              await fetch('/api/alliances/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: token, game_id: gameId, player_id: e.target.value, alliance_id: al.id }) })
                              e.target.value = ''
                              await fetchAlliances(); await fetchGame()
                            }} defaultValue=""
                              className="w-full px-2 py-1.5 outline-none text-xs rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                              <option value="" disabled>+ Speler toevoegen...</option>
                              {nonMembers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STATS TAB ── */}
        {tab === 'stats' && (
          <div className="h-full overflow-y-auto p-3">
            <div className="max-w-3xl mx-auto space-y-3">

              {/* Winner/leader banner */}
              {(() => {
                const top3 = [...game.players].sort((a, b) => b.crowns - a.crowns).slice(0, 3)
                if (top3.length === 0) return null
                const winner = top3[0]
                if (game.status === 'active') return (
                  <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a' }}>
                    <div className="text-2xl">🏆</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold mb-0.5" style={{ color: '#d97706' }}>Aan de leiding</p>
                      <p className="font-black text-base truncate" style={{ color: 'var(--text)' }}>{winner.name}</p>
                    </div>
                    <span className="font-black text-lg px-3 py-1 rounded-xl" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff' }}>{winner.crowns}👑</span>
                  </div>
                )
                return (
                  <div className="p-5 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a' }}>
                    <div className="text-4xl mb-2">🏆</div>
                    <p className="text-xs font-bold mb-1" style={{ color: '#d97706' }}>Winnaar</p>
                    <p className="font-black text-2xl" style={{ color: 'var(--text)' }}>{winner.name}</p>
                    <p className="font-black text-xl mt-1 px-4 py-1.5 rounded-xl inline-block" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff' }}>{winner.crowns}👑</p>
                    {top3.length > 1 && (
                      <div className="flex justify-center gap-6 mt-4 pt-4" style={{ borderTop: '1px solid #fde68a' }}>
                        {top3.slice(1).map((p, i) => (
                          <div key={p.id} className="text-center">
                            <div className="text-xl mb-1">{i === 0 ? '🥈' : '🥉'}</div>
                            <p className="text-xs font-bold truncate max-w-16" style={{ color: 'var(--text)' }}>{p.name}</p>
                            <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{p.crowns}👑</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="flex items-center justify-between">
                <p className="font-black text-sm" style={{ color: 'var(--text)' }}>Statistieken</p>
                <div className="flex gap-1.5">
                  <button onClick={fetchStats} className="font-bold text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>↺</button>
                  <button onClick={() => {
                    const lines = [`${game.name} — Eindstand`, '']
                    game.players.sort((a, b) => b.crowns - a.crowns).forEach((p, i) => { lines.push(`${i + 1}. ${p.name} — ${p.crowns}👑`) })
                    navigator.clipboard.writeText(lines.join('\n')).then(() => setSavingStatus('Gekopieerd'))
                    setTimeout(() => setSavingStatus(''), 3000)
                  }} className="font-bold text-xs px-2.5 py-1.5 rounded-lg" style={{ background: '#eff6ff', color: '#2563eb' }}>Deel</button>
                  <button onClick={restartGame} className="font-bold text-xs px-2.5 py-1.5 rounded-lg text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>↺ Ronde</button>
                </div>
              </div>

              {/* Settings inline */}
              <details className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                <summary className="p-3 cursor-pointer text-xs font-bold" style={{ color: 'var(--muted)' }}>Spelinstellingen ▾</summary>
                <div className="p-3 pt-0 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex gap-2">
                    <input defaultValue={game.name} id="game-name-input" className="flex-1 px-3 py-2 text-sm outline-none rounded-xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }} />
                    <button onClick={() => saveSettings({ name: (document.getElementById('game-name-input') as HTMLInputElement).value })} className="px-3 py-2 font-bold text-sm rounded-xl text-white" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>OK</button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <select defaultValue={(config?.duration_minutes as number) ?? 0} onChange={e => saveSettings({ config: { ...config, duration_minutes: +e.target.value || null } })}
                      className="px-3 py-2 outline-none rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                      <option value={0}>Onbeperkt</option><option value={30}>30 min</option><option value={60}>1 uur</option><option value={90}>1,5 uur</option><option value={120}>2 uur</option>
                    </select>
                    <select defaultValue={(config?.crown_tick_interval_minutes as number) ?? 2} onChange={e => saveSettings({ config: { ...config, crown_tick_interval_minutes: +e.target.value } })}
                      className="px-3 py-2 outline-none rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                      <option value={1}>Tick: 1 min</option><option value={2}>Tick: 2 min</option><option value={5}>Tick: 5 min</option>
                    </select>
                    <select defaultValue={(config?.max_players as number) ?? 20} onChange={e => saveSettings({ config: { ...config, max_players: +e.target.value } })}
                      className="px-3 py-2 outline-none rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                      {[5, 10, 15, 20, 30, 40].map(n => <option key={n} value={n}>{n} max</option>)}
                    </select>
                  </div>
                </div>
              </details>

              <CrownChart players={history.players} ticks={history.ticks} />

              {stats.length === 0 && <p className="text-sm text-center py-12" style={{ color: 'var(--dim)' }}>Spelers moeten eerst bewegen</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((s: Record<string, unknown>) => {
                  const player = s.player as { name: string; color: string; avatar?: string; crowns: number }
                  const dist = Math.round((s.distance_meters as number) ?? 0)
                  const km = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`
                  return (
                    <div key={s.player_id as string} className="rounded-2xl p-3" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: player?.color + '20', border: `2px solid ${player?.color}` }}>{player?.avatar ?? player?.name?.[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black truncate text-sm" style={{ color: 'var(--text)' }}>{player?.name}</p>
                          <p className="text-xs font-bold" style={{ color: 'var(--amber)' }}>{player?.crowns}👑</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {[
                          { label: 'Afstand', value: km, icon: '🚶' },
                          { label: 'Claims', value: (s.locations_claimed as number) ?? 0, icon: '🏴' },
                          { label: 'Powerups', value: (s.powerups_found as number) ?? 0, icon: '⚡' },
                        ].map(({ label, value, icon }) => (
                          <div key={label} className="rounded-xl p-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <p className="text-base leading-none mb-1">{icon}</p>
                            <p className="font-black text-sm" style={{ color: 'var(--text)' }}>{value}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
