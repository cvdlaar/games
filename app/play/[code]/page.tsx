'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Game, Location, Player, LocationOwnership, Encounter, LOCATION_TYPE_CONFIG, LocationType, NARRATOR_PRESETS, StrategyType, STRATEGY_PRESETS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getDistanceMeters, isInsideGeofence } from '@/lib/game-logic'
import ChallengeModal from '@/components/player/ChallengeModal'
import EncounterModal from '@/components/player/EncounterModal'
import OnboardingModal from '@/components/player/OnboardingModal'
import StoryOverlay from '@/components/player/StoryOverlay'
import EndingScreen from '@/components/player/EndingScreen'
import { StoryChapter } from '@/lib/types'

const PlayerMap = dynamic(() => import('@/components/player/PlayerMap'), { ssr: false })

type Tab = 'map' | 'rankings' | 'events'

interface RankedPlayer {
  id: string
  name: string
  color: string
  crowns: number
  location_count: number
  crown_income: number
  distance_meters: number
  score: number
  rank: number
  avatar?: string
}

interface StoryEventData {
  chapter_id: string
  title: string
  content: string
  trigger: string
  narrator_id: string
}

interface GameEvent {
  id: string
  type: string
  player_id: string | null
  data: Record<string, unknown>
  created_at: string
}

export default function PlayPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()

  const [game, setGame] = useState<Game | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [ownership, setOwnership] = useState<(LocationOwnership & { player: Player })[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayer, setMyPlayer] = useState<Player | null>(null)
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [rankings, setRankings] = useState<RankedPlayer[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [nearbyPlayers, setNearbyPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState('')
  const [outsideGeofence, setOutsideGeofence] = useState(false)
  const [approvedPhotos, setApprovedPhotos] = useState<{ id: string; player_name: string; player_color: string; player_avatar: string; location_name: string; photo_prompt: string; answer: string }[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [myAvatar, setMyAvatar] = useState('🧭')
  const [activeBuffs, setActiveBuffs] = useState<{ type: string; expires_at: string; value?: Record<string, unknown> }[]>([])
  const [outpostWarning, setOutpostWarning] = useState(false)
  const [storyEvent, setStoryEvent] = useState<StoryEventData | null>(null)
  const [stormActive, setStormActive] = useState(false)
  const [alliances, setAlliances] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [myAllianceId, setMyAllianceId] = useState<string | null>(null)
  const [regions, setRegions] = useState<Array<{ id: string; color: string; name: string }>>([])
  const [regionNotification, setRegionNotification] = useState<{ name: string; color: string } | null>(null)
  const [lastEventsSeenAt, setLastEventsSeenAt] = useState<string>(() => localStorage.getItem('events_seen_at') ?? new Date(0).toISOString())
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => localStorage.getItem('push_enabled') === '1')
  const [isOffline, setIsOffline] = useState(false)
  const [myStrategy, setMyStrategy] = useState<StrategyType | null>(() => localStorage.getItem('player_strategy') as StrategyType | null)
  const [locationLostMsg, setLocationLostMsg] = useState<{ name: string; attacker: string } | null>(null)


  const playerIdRef = useRef<string>('')
  const playerTokenRef = useRef<string>('')
  const stormTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playersRef = useRef<Player[]>([])
  const locationsRef = useRef<Location[]>([])
  const prevRegionControllersRef = useRef<Record<string, string | null>>({})
  playersRef.current = players
  locationsRef.current = locations

  const fetchGameData = useCallback(async (gameId: string) => {
    const [locsRes, ownRes, playersRes] = await Promise.all([
      fetch(`/api/locations?gameId=${gameId}`),
      fetch(`/api/locations?gameId=${gameId}`),
      fetch(`/api/games/${gameId}`),
    ])
    const locsData = await locsRes.json()
    const gameData = await playersRes.json()
    if (Array.isArray(locsData)) {
      setLocations(locsData)
      setOwnership(locsData.flatMap((l: Location & { location_ownership?: (LocationOwnership & { player: Player })[] }) => l.location_ownership ?? []))
    }
    if (gameData.players) setPlayers(gameData.players)
    if (gameData.location_ownership) setOwnership(gameData.location_ownership)
    return gameData
    void ownRes
  }, [])

  const fetchRankings = useCallback(async (gameId: string) => {
    const res = await fetch(`/api/rankings?gameId=${gameId}`)
    const data = await res.json()
    if (Array.isArray(data)) setRankings(data)
  }, [])

  const checkEncounter = useCallback(async () => {
    const pid = playerIdRef.current
    if (!pid) return
    const res = await fetch(`/api/encounters?playerId=${pid}`)
    const data = await res.json()
    if (data) setEncounter(data)
  }, [])

  const fetchEvents = useCallback(async (gameId: string, showNotification = false) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      setEvents(data)
      if (showNotification && data.length > 0) {
        const latest = data[0]
        const evData = latest.data as Record<string, string>
        if (latest.type === 'admin_event') {
          const tgt = evData.target_player_id
          if (!tgt || tgt === playerIdRef.current) {
            setStatusMsg(`📢 ${evData.title}`)
            setTimeout(() => setStatusMsg(''), 5000)
          }
          // Storm effect can arrive as admin_event when that's newest
          if (evData.event_type === 'storm') {
            setStormActive(true)
            if (stormTimeoutRef.current) clearTimeout(stormTimeoutRef.current)
            stormTimeoutRef.current = setTimeout(() => setStormActive(false), 45000)
          }
        } else if (latest.type === 'crown_rain') {
          setStatusMsg('👑 Schatkistuitdeling! +kronen voor alle ridders!')
          setTimeout(() => setStatusMsg(''), 4000)
        } else if (latest.type === 'storm') {
          setStatusMsg('🌩️ Veldslag! Alle gebieden zijn neutraal!')
          setTimeout(() => setStatusMsg(''), 4000)
          setStormActive(true)
          if (stormTimeoutRef.current) clearTimeout(stormTimeoutRef.current)
          stormTimeoutRef.current = setTimeout(() => setStormActive(false), 45000)
        } else if (latest.type === 'milestone_reached' && latest.player_id === playerIdRef.current) {
          const msg = (evData as Record<string, string>).message ?? '🚶 Mijlpaal bereikt! Dubbele inkomsten voor 5 min.'
          setStatusMsg(msg)
          setTimeout(() => setStatusMsg(''), 6000)
        } else if (latest.type === 'bonus_mission_won' && latest.player_id !== playerIdRef.current) {
          const bd = latest.data as Record<string, unknown>
          setStatusMsg(`🎯 Bonusmissie gewonnen! ${bd.location_name} − +${bd.bonus_crowns}👑`)
          setTimeout(() => setStatusMsg(''), 5000)
        } else if (latest.type === 'phase_change') {
          const pd = latest.data as Record<string, unknown>
          const penalty = pd.crown_penalty as number
          const msg = `⚔️ Fase: ${pd.phase_name} — zone verkleind!${penalty ? ` ${penalty}👑 boete buiten zone per tick` : ''}`
          setStatusMsg(msg)
          setTimeout(() => setStatusMsg(''), 8000)
        } else if (latest.type === 'story') {
          setStoryEvent(latest.data as StoryEventData)
        } else if (latest.type === 'location_claimed') {
          const cd = latest.data as Record<string, unknown>
          if (cd.previous_owner === playerIdRef.current) {
            setLocationLostMsg({
              name: (cd.location_name as string) ?? 'Locatie',
              attacker: (cd.attacker_name as string) ?? 'Iemand',
            })
            setTimeout(() => setLocationLostMsg(null), 6000)
          }
        } else if (latest.type === 'outpost_warning') {
          const od = latest.data as Record<string, unknown>
          if (od.outpost_owner_id === playerIdRef.current) {
            const intruder = playersRef.current.find(p => p.id === latest.player_id)
            setStatusMsg(`⚠️ ${intruder?.name ?? 'Vijand'} nadert jouw observatiepost "${od.outpost_name}" (${od.distance_meters}m)!`)
            setTimeout(() => setStatusMsg(''), 6000)
          }
        } else if (latest.type === 'photo_approved' && latest.player_id === playerIdRef.current) {
          const pd = latest.data as Record<string, unknown>
          setStatusMsg(`✅ Foto goedgekeurd! ${pd.location_name} is van jou.`)
          setTimeout(() => setStatusMsg(''), 6000)
          await fetchGameData(gameId)
        } else if (latest.type === 'photo_rejected' && latest.player_id === playerIdRef.current) {
          const pd = latest.data as Record<string, unknown>
          setStatusMsg(`❌ Foto afgekeurd bij ${pd.location_name}. Probeer opnieuw.`)
          setTimeout(() => setStatusMsg(''), 6000)
        } else if (latest.type === 'player_kicked' && latest.player_id === playerIdRef.current) {
          const kd = latest.data as Record<string, unknown>
          localStorage.removeItem('player_id')
          localStorage.removeItem('player_token')
          localStorage.removeItem('player_name')
          localStorage.removeItem('player_game_code')
          router.replace(`/?kicked=1&reason=${encodeURIComponent((kd.reason as string) ?? '')}`)
        }
      }
    }
  }, [])

  useEffect(() => {
    const pid = localStorage.getItem('player_id')
    const token = localStorage.getItem('player_token')
    if (!pid || !token) { router.push('/'); return }
    playerIdRef.current = pid
    playerTokenRef.current = token
    setMyAvatar(localStorage.getItem('player_avatar') ?? '🧭')

    // Show onboarding for first-time players
    const seen = localStorage.getItem('onboarding_seen')
    if (!seen) setShowOnboarding(true)

    async function init() {
      const gameRes = await fetch(`/api/games?code=${code}`)
      if (!gameRes.ok) { router.push('/'); return }
      const gameData = await gameRes.json()
      setGame(gameData)

      const fullGame = await fetchGameData(gameData.id)
      const me = fullGame.players?.find((p: Player) => p.id === pid)
      if (me) {
        setMyPlayer(me)
        setMyAllianceId((me as Player & { alliance_id?: string | null }).alliance_id ?? null)
        if (me.strategy) {
          setMyStrategy(me.strategy)
          localStorage.setItem('player_strategy', me.strategy)
        }
      }

      const alRes = await fetch(`/api/alliances?gameId=${gameData.id}`)
      if (alRes.ok) setAlliances(await alRes.json())

      const regRes = await fetch(`/api/regions?gameId=${gameData.id}`)
      if (regRes.ok) setRegions(await regRes.json())

      await fetchRankings(gameData.id)
      await fetchEvents(gameData.id)
      setLoading(false)
    }
    init()
  }, [code, router, fetchGameData, fetchRankings, fetchEvents, checkEncounter])

  // Fetch approved photos once when game ends
  useEffect(() => {
    if (game?.status === 'ended' && game.id) {
      fetch(`/api/photos?gameId=${game.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(setApprovedPhotos)
        .catch(() => {})
    }
  }, [game?.status, game?.id])

  // Detect region control changes — notify when my team captures a full region
  useEffect(() => {
    if (!myPlayer || regions.length === 0) return
    const newControllers: Record<string, string | null> = {}
    for (const r of regions) {
      const regionLocs = locations.filter(l => (l as Location & { region_id?: string | null }).region_id === r.id)
      const totalCount = regionLocs.length
      if (totalCount === 0) { newControllers[r.id] = null; continue }
      const playerCounts: Record<string, number> = {}
      for (const loc of regionLocs) {
        const owner = ownership.find(o => o.location_id === loc.id)
        if (owner) playerCounts[owner.player_id] = (playerCounts[owner.player_id] ?? 0) + 1
      }
      const controllerId = Object.entries(playerCounts).find(([, c]) => c >= totalCount)?.[0] ?? null
      newControllers[r.id] = controllerId
      const prev = prevRegionControllersRef.current[r.id]
      if (controllerId === myPlayer.id && prev !== undefined && prev !== myPlayer.id) {
        setRegionNotification({ name: r.name, color: r.color })
        setTimeout(() => setRegionNotification(null), 6000)
      }
    }
    prevRegionControllersRef.current = newControllers
  }, [ownership]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll buffs every 30s
  useEffect(() => {
    const pid = playerIdRef.current
    if (!pid) return
    const fetchBuffs = async () => {
      const res = await fetch(`/api/buffs?playerId=${pid}`)
      if (res.ok) setActiveBuffs(await res.json())
    }
    fetchBuffs()
    const id = setInterval(fetchBuffs, 30_000)
    return () => clearInterval(id)
  }, [myPlayer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling — keeps events, game state and rankings live without relying solely on realtime
  // Pauses automatically when the browser tab is hidden to save battery and API calls
  useEffect(() => {
    if (!game?.id || game.status === 'ended') return
    const gameId = game.id
    let eventsId: ReturnType<typeof setInterval> | null = null
    let stateId: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (eventsId) return
      eventsId = setInterval(() => fetchEvents(gameId), 5_000)
      stateId = setInterval(async () => {
        const d = await fetchGameData(gameId)
        await fetchRankings(gameId)
        const me = d?.players?.find((p: Player) => p.id === playerIdRef.current)
        if (me) {
          setMyPlayer(me)
          setMyAllianceId((me as Player & { alliance_id?: string | null }).alliance_id ?? null)
        }
        await checkEncounter()
      }, 10_000)
    }

    const stopPolling = () => {
      if (eventsId) { clearInterval(eventsId); eventsId = null }
      if (stateId) { clearInterval(stateId); stateId = null }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) stopPolling()
      else { fetchEvents(gameId); startPolling() }
    }

    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [game?.id, game?.status, fetchEvents, fetchGameData, fetchRankings, checkEncounter])

  // Realtime subscriptions — set up after game is known, separately from async init
  useEffect(() => {
    if (!game) return
    const supabase = createClient()
    const channel = supabase
      .channel(`play-rt-${game.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_ownership' }, async (payload) => {
        const row = payload.new as { player_id: string; location_id: string }
        if (row.player_id && row.player_id !== playerIdRef.current) {
          const capPlayer = playersRef.current.find(p => p.id === row.player_id)
          const capLoc = locationsRef.current.find(l => l.id === row.location_id)
          if (capPlayer && capLoc) {
            setStatusMsg(`🚩 ${capPlayer.name} veroverde ${capLoc.name}!`)
            setTimeout(() => setStatusMsg(''), 3000)
          }
        }
        await fetchGameData(game.id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'location_ownership' }, () => fetchGameData(game.id))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'location_ownership' }, () => fetchGameData(game.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${game.id}` }, async () => {
        const d = await fetchGameData(game.id)
        await fetchRankings(game.id)
        const me = d?.players?.find((p: Player) => p.id === playerIdRef.current)
        if (me) {
          setMyPlayer(me)
          setMyAllianceId((me as Player & { alliance_id?: string | null }).alliance_id ?? null)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, async () => {
        const res = await fetch(`/api/games/${game.id}`)
        const data = await res.json()
        if (data) setGame(data)
        // New round: reset my player data
        if (data?.status === 'active') { await fetchGameData(game.id); await fetchRankings(game.id) }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${game.id}` }, (payload) => {
        const ev = payload.new as GameEvent
        setEvents(prev => [ev, ...prev].slice(0, 30))
        fetchEvents(game.id, true)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'encounters' }, () => checkEncounter())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [game?.id, fetchGameData, fetchRankings, fetchEvents, checkEncounter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Online/offline detection
  useEffect(() => {
    const onOffline = () => setIsOffline(true)
    const onOnline = () => setIsOffline(false)
    setIsOffline(!navigator.onLine)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline) }
  }, [])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS niet beschikbaar op dit apparaat. Locatie-functies werken niet.')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        setGpsError(null)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMyPos({ lat, lng })

        const pid = playerIdRef.current
        const token = playerTokenRef.current
        if (!pid || !token) return

        await fetch(`/api/players/${pid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, lat, lng, last_seen: new Date().toISOString() }),
        })

        // Geofence check
        setGame(currentGame => {
          if (currentGame) {
            const gf = (currentGame.config as { geofence?: import('@/lib/types').Geofence })?.geofence
            if (gf) setOutsideGeofence(!isInsideGeofence(lat, lng, gf))
          }
          return currentGame
        })

        // Check nearby players for encounters (50m)
        setPlayers(prev => {
          const nearby = prev.filter(p => {
            if (p.id === pid || !p.lat || !p.lng) return false
            return getDistanceMeters(lat, lng, p.lat, p.lng) < 50
          })
          setNearbyPlayers(nearby)
          return prev
        })

        // Outpost ability: warn if any enemy is within 200m of an outpost we own
        setOwnership(ownCurrent => {
          setLocations(locsCurrent => {
            const myOutposts = ownCurrent
              .filter(o => o.player_id === pid)
              .map(o => locsCurrent.find(l => l.id === o.location_id))
              .filter((l): l is Location => l?.type === 'outpost')

            if (myOutposts.length === 0) { setOutpostWarning(false); return locsCurrent }

            setPlayers(playersCurrent => {
              const enemyNear = playersCurrent.some(p => {
                if (p.id === pid || !p.lat || !p.lng) return false
                return myOutposts.some(op => getDistanceMeters(p.lat!, p.lng!, op.lat, op.lng) < 200)
              })
              setOutpostWarning(enemyNear)
              return playersCurrent
            })
            return locsCurrent
          })
          return ownCurrent
        })
      },
      (err) => {
        if (err.code === 1) {
          setGpsError('GPS-toegang geweigerd. Sta locatie toe in je browserinstellingen.')
        } else if (err.code === 2) {
          setGpsError('GPS-signaal niet gevonden. Ga naar buiten of schakel locatie in.')
        } else {
          setGpsError('GPS time-out — probeer opnieuw.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  async function joinAlliance(allianceId: string | null) {
    const pid = playerIdRef.current
    const token = playerTokenRef.current
    const res = await fetch('/api/alliances/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: pid, token, alliance_id: allianceId }),
    })
    if (res.ok) {
      setMyAllianceId(allianceId)
      setMyPlayer(p => p ? { ...p, alliance_id: allianceId } : p)
    }
  }

  async function triggerEncounter(targetPlayer: Player) {
    const pid = playerIdRef.current
    const token = playerTokenRef.current
    const res = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initiator_id: pid, token, target_id: targetPlayer.id }),
    })
    if (res.ok) {
      const data = await res.json()
      setEncounter(data)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
        <div className="text-3xl animate-pulse">🗺️</div>
        <p style={{ color: 'var(--muted)' }}>Verbinden met spel...</p>
      </div>
    )
  }

  if (!game) return null

  // Game ended screen
  if (game.status === 'ended') {
    const storyConf = game.config?.story
    const outroChapter = storyConf?.chapters?.find((c: StoryChapter) => c.trigger === 'game_end')
    const endingPlayers: { id: string; name: string; color: string; avatar?: string; crowns: number; rank: number }[] =
      rankings.length > 0
        ? rankings.map(r => ({ id: r.id, name: r.name, color: r.color, crowns: r.crowns, rank: r.rank, avatar: (players.find(p => p.id === r.id) as Player & { avatar?: string })?.avatar }))
        : [...players].sort((a, b) => b.crowns - a.crowns).map((p, i) => ({ id: p.id, name: p.name, color: p.color, crowns: p.crowns, rank: i + 1, avatar: (p as Player & { avatar?: string }).avatar }))

    return (
      <>
        {storyEvent && (
          <StoryOverlay
            chapter={{ id: storyEvent.chapter_id, title: storyEvent.title, content: storyEvent.content, trigger: storyEvent.trigger as StoryChapter['trigger'] }}
            narratorId={storyEvent.narrator_id}
            onDismiss={() => setStoryEvent(null)}
          />
        )}
        <EndingScreen
          gameName={game.name}
          players={endingPlayers}
          myPlayerId={myPlayer?.id ?? ''}
          outroChapter={outroChapter}
          narratorId={storyConf?.narrator_id}
          photos={approvedPhotos}
          onShare={() => {
            const lines = [`🏆 ${game.name}`, '', ...endingPlayers.map(p => `${p.rank}. ${p.name} — ${p.crowns} 👑`)]
            navigator.clipboard.writeText(lines.join('\n'))
          }}
        />
      </>
    )
  }

  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      const pid = playerIdRef.current
      const tok = playerTokenRef.current
      if (!pid || !tok) return
      await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: pid, token: tok, subscription: sub.toJSON() }),
      })
      setPushEnabled(true)
      localStorage.setItem('push_enabled', '1')
    } catch { /* browser doesn't support or user denied */ }
  }

  const myOwnedCount = ownership.filter(o => o.player_id === myPlayer?.id).length
  const myId = myPlayer?.id ?? ''

  // Compute region control status
  const regionControl = regions.map(r => {
    const regionLocs = locations.filter(l => (l as Location & { region_id?: string | null }).region_id === r.id)
    const totalCount = regionLocs.length
    const playerCounts: Record<string, number> = {}
    for (const loc of regionLocs) {
      const owner = ownership.find(o => o.location_id === loc.id)
      if (owner) playerCounts[owner.player_id] = (playerCounts[owner.player_id] ?? 0) + 1
    }
    const controllerId = totalCount > 0
      ? (Object.entries(playerCounts).find(([, c]) => c >= totalCount)?.[0] ?? null)
      : null
    const controller = controllerId ? players.find(p => p.id === controllerId) ?? null : null
    const myCount = playerCounts[myId] ?? 0
    return { ...r, totalCount, controller, controllerId, myCount }
  })

  // My personal notifications: events directly relevant to this player
  const myNotifications = events.filter(ev => {
    const d = ev.data as Record<string, unknown>
    if (ev.type === 'location_claimed' && d.previous_owner === myId) return true
    if (ev.type === 'crown_bonus' && ev.player_id === myId) return true
    if (ev.type === 'bonus_mission_won' && ev.player_id === myId) return true
    if (ev.type === 'admin_event' && (!d.target_player_id || d.target_player_id === myId)) return true
    if (ev.type === 'encounter_resolved' && (d.initiator_id === myId || d.target_id === myId)) return true
    if (ev.type === 'crown_tick' && myId && (d.payouts as Record<string, number>)?.[myId] !== undefined) return true
    if (ev.type === 'phase_change' || ev.type === 'story') return true
    return false
  })
  const unreadCount = myNotifications.filter(ev => ev.created_at > lastEventsSeenAt).length

  // Tower ability: see players within 500m of any owned tower
  const myTowerLocations = ownership
    .filter(o => o.player_id === myId)
    .map(o => locations.find(l => l.id === o.location_id))
    .filter(l => l?.type === 'tower') as typeof locations
  const ownsTower = myTowerLocations.length > 0
  // Reveal all buff
  const hasRevealAll = activeBuffs.some(b => b.type === 'reveal_all')
  // Secret location buff: shows powerup positions
  const hasSecretLocation = activeBuffs.some(b => b.type === 'secret_location')
  // Shield buff
  const hasShield = activeBuffs.some(b => b.type === 'shield')
  // Double income buff
  const hasDoubleIncome = activeBuffs.some(b => b.type === 'double_income')
  // Players visible on map: reveal_all = iedereen, tower = binnen 500m van een toren, anders 150m radius
  const visiblePlayers = hasRevealAll
    ? players.filter(p => p.id !== myId)
    : players.filter(p => {
        if (p.id === myId || !p.lat || !p.lng) return false
        if (ownsTower) {
          return myTowerLocations.some(t => getDistanceMeters(t.lat, t.lng, p.lat!, p.lng!) < 500)
        }
        if (!myPos) return false
        const visRadius = myStrategy === 'spion' ? 300 : 150
        return getDistanceMeters(myPos.lat, myPos.lng, p.lat, p.lng) < visRadius
      })

  // Active bonus mission location (last admin_event with event_type=bonus_mission, not yet won)
  const lastMissionEvent = events.find(ev => ev.type === 'admin_event' && (ev.data as Record<string, unknown>).event_type === 'bonus_mission')
  const lastMissionWon = events.find(ev => ev.type === 'bonus_mission_won')
  const activeMissionLocationId = lastMissionEvent && (!lastMissionWon || lastMissionWon.created_at < lastMissionEvent.created_at)
    ? (lastMissionEvent.data as Record<string, unknown>).location_id as string | null
    : null

  // Active location boost (within last 15 minutes)
  const lastBoostEvent = events.find(ev => ev.type === 'admin_event' && (ev.data as Record<string, unknown>).event_type === 'location_boost')
  const boostedLocationId = lastBoostEvent && (Date.now() - new Date(lastBoostEvent.created_at).getTime()) < 15 * 60 * 1000
    ? (lastBoostEvent.data as Record<string, unknown>).location_id as string | null
    : null

  const narratorId = game ? ((game.config as Record<string, unknown>)?.story as Record<string, unknown> | undefined)?.narrator_id as string | undefined : undefined
  const narrator = NARRATOR_PRESETS.find(n => n.id === narratorId) ?? null
  const narratorColor = narrator?.color ?? '#2563eb'

  return (
    <div className="h-full flex flex-col no-select" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {showOnboarding && (
        <OnboardingModal onClose={() => { setShowOnboarding(false); localStorage.setItem('onboarding_seen', '1') }} />
      )}

      {/* HUD top bar */}
      {(() => {
        const hudColor2 = narrator ? narrator.color + 'cc' : '#7c3aed'
        return (
      <div className="shrink-0" style={{ background: `linear-gradient(135deg, ${narratorColor} 0%, ${hudColor2} 100%)`, boxShadow: `0 2px 12px ${narratorColor}40` }}>
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg shrink-0"
              style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              {myAvatar}
            </div>
            <div>
              <p className="font-black text-sm leading-tight" style={{ color: '#fff' }}>{myPlayer?.name ?? '···'}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{game.name}</p>
                {myStrategy && STRATEGY_PRESETS[myStrategy] && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                    {STRATEGY_PRESETS[myStrategy].emoji} {STRATEGY_PRESETS[myStrategy].label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {hasShield       && <span className="text-sm px-2 py-1 rounded-xl font-bold" style={{ background: '#3b82f6', color: '#fff', boxShadow: '0 2px 6px rgba(59,130,246,0.5)' }}>🛡</span>}
            {hasDoubleIncome && <span className="text-sm px-2 py-1 rounded-xl font-bold" style={{ background: '#22c55e', color: '#fff', boxShadow: '0 2px 6px rgba(34,197,94,0.5)' }}>×2</span>}
            {hasRevealAll    && <span className="text-sm px-2 py-1 rounded-xl font-bold" style={{ background: '#8b5cf6', color: '#fff', boxShadow: '0 2px 6px rgba(139,92,246,0.5)' }}>📡</span>}
            {ownsTower       && <span className="text-sm px-2 py-1 rounded-xl font-bold" style={{ background: '#f59e0b', color: '#fff', boxShadow: '0 2px 6px rgba(245,158,11,0.5)' }}>🗼</span>}
            {!pushEnabled && 'Notification' in window && (
              <button onClick={subscribePush} title="Meldingen inschakelen"
                className="text-sm px-2 py-1 rounded-xl font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)' }}>
                🔔
              </button>
            )}
            {pushEnabled && <span className="text-sm px-2 py-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Meldingen actief">🔔</span>}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl" style={{ background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
              <span className="text-xs font-bold" style={{ color: '#2563eb' }}>{myOwnedCount} 🏴</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 2px 8px rgba(245,158,11,0.4)' }}>
              <span className="font-black text-base leading-none" style={{ color: '#fff' }}>{myPlayer?.crowns ?? 0}</span>
              <span className="text-sm">👑</span>
            </div>
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center justify-between">
          {narrator ? (
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.65)' }}>
              <span>{narrator.emoji}</span>
              <span>{narrator.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>— {narrator.tagline}</span>
            </span>
          ) : <span />}
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl" style={{
            background: game.status === 'active' ? '#22c55e' : game.status === 'setup' ? '#f59e0b' : '#ef4444',
            color: '#fff',
            boxShadow: game.status === 'active' ? '0 2px 6px rgba(34,197,94,0.5)' : '0 2px 6px rgba(245,158,11,0.4)',
          }}>
            {game.status === 'active' ? '● ACTIEF' : game.status === 'setup' ? '◎ WACHT' : '✕ BEËINDIGD'}
          </span>
        </div>
      </div>
        )
      })()}

      {/* Main content */}
      <div className="flex-1 overflow-hidden relative">
        {tab === 'map' && (
          <>
            {/* Storm visual overlay */}
            {stormActive && (
              <div className="absolute inset-0 pointer-events-none z-[900] overflow-hidden">
                <style>{`
                  @keyframes rain-drop {
                    0%   { transform: translateY(-20px) rotate(13deg); opacity: 0.75; }
                    100% { transform: translateY(110vh) rotate(13deg); opacity: 0; }
                  }
                `}</style>
                <div className="absolute inset-0" style={{ background: 'rgba(8,18,55,0.32)' }} />
                {Array.from({ length: 42 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      left: `${(i * 19 + 6) % 100}%`,
                      top: '-20px',
                      width: '1.5px',
                      height: `${11 + (i * 5) % 9}px`,
                      background: 'rgba(147,197,253,0.65)',
                      animation: `rain-drop ${0.65 + (i * 0.035) % 0.55}s ${(i * 0.085) % 1.3}s linear infinite`,
                    }}
                  />
                ))}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-bold text-blue-200 bg-blue-950/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-blue-400/20 flex items-center gap-1.5 whitespace-nowrap shadow-lg">
                  <span className="animate-pulse">⛈️</span> Veldslag — gebieden neutraal
                </div>
              </div>
            )}
            <PlayerMap
              locations={locations}
              ownership={ownership}
              players={visiblePlayers}
              myPlayerId={myPlayer?.id ?? ''}
              myPos={myPos}
              onLocationSelect={setSelectedLocation}
              secretPowerups={hasSecretLocation
                ? (activeBuffs.find(b => b.type === 'secret_location')?.value as { powerup_locations?: { id: string; emoji: string; label: string; lat: number; lng: number }[] })?.powerup_locations
                : undefined
              }
              geofence={(game?.config as { geofence?: import('@/lib/types').Geofence | null })?.geofence}
              homeBase={(game?.config as { home_base?: { lat: number; lng: number } | null })?.home_base}
              alliances={alliances}
              myAllianceId={myAllianceId}
              regions={regions}
              missionLocationId={activeMissionLocationId}
              boostedLocationId={boostedLocationId}
            />

            {/* Map HUD alerts */}
            {locationLostMsg && (
              <div className="absolute top-3 left-3 right-3 z-[1005] shake">
                <div className="px-4 py-3 flex items-center gap-3 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,#450a0a,#b91c1c)', color: '#fff', boxShadow: '0 4px 20px rgba(185,28,28,0.5)', border: '1.5px solid rgba(255,100,100,0.3)' }}>
                  <span className="text-2xl shrink-0">🏴</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm">LOCATIE VERLOREN</p>
                    <p className="text-xs opacity-80 truncate">{locationLostMsg.name} ingenomen door {locationLostMsg.attacker}</p>
                  </div>
                  <button onClick={() => setLocationLostMsg(null)} className="text-xs opacity-60 font-bold shrink-0">✕</button>
                </div>
              </div>
            )}
            {isOffline && (
              <div className="absolute top-3 left-3 right-3 z-[1004] slide-up">
                <div className="text-xs font-bold px-4 py-2.5 flex items-center gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg,#7c2d12,#c2410c)', color: '#fff', boxShadow: '0 2px 12px rgba(194,65,12,0.5)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                  <span className="text-base shrink-0">📡</span>
                  <span className="flex-1">Geen internetverbinding — acties werken niet</span>
                </div>
              </div>
            )}
            {gpsError && !isOffline && (
              <div className="absolute top-3 left-3 right-3 z-[1003] slide-up">
                <div className="text-xs font-bold px-4 py-2.5 flex items-center gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e40af)', color: '#fff', boxShadow: '0 2px 12px rgba(30,58,138,0.5)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                  <span className="text-base shrink-0">📍</span>
                  <span className="flex-1">{gpsError}</span>
                </div>
              </div>
            )}
            {outsideGeofence && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] slide-up">
                <div className="text-xs font-black px-4 py-2 flex items-center gap-2 rounded-xl" style={{ background: '#ef4444', color: '#fff', boxShadow: '0 2px 12px rgba(239,68,68,0.5)' }}>
                  ⚠ Buiten speelzone — keer terug
                </div>
              </div>
            )}
            {outpostWarning && !outsideGeofence && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] slide-up">
                <div className="text-xs font-black px-4 py-2 flex items-center gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 2px 12px rgba(124,58,237,0.5)' }}>
                  ◉ Contact bij post gedetecteerd
                </div>
              </div>
            )}
            {nearbyPlayers.length > 0 && !outpostWarning && !outsideGeofence && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] slide-up">
                <div className="text-xs font-black px-3 py-2 flex items-center gap-2 rounded-xl" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff', boxShadow: '0 2px 12px rgba(245,158,11,0.5)' }}>
                  ◉ {nearbyPlayers.length} vijand nabij
                  <button onClick={() => triggerEncounter(nearbyPlayers[0])}
                    className="px-2 py-0.5 rounded-lg font-black transition-all"
                    style={{ background: '#fff', color: '#d97706' }}>
                    Aanval
                  </button>
                </div>
              </div>
            )}
            {statusMsg && !nearbyPlayers.length && !outpostWarning && !outsideGeofence && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] slide-up">
                <div className="text-xs px-4 py-2 rounded-xl font-medium" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                  {statusMsg}
                </div>
              </div>
            )}
            {regionNotification && (
              <div className="absolute top-3 left-3 right-3 z-[1001] slide-up">
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-white shadow-2xl"
                  style={{ background: `linear-gradient(135deg, ${regionNotification.color}, ${regionNotification.color}cc)`, border: `2px solid ${regionNotification.color}` }}>
                  <span className="text-2xl">🌍</span>
                  <div>
                    <p className="text-sm font-black">Regio veroverd!</p>
                    <p className="text-xs opacity-90 font-medium">{regionNotification.name} staat volledig onder jouw controle · +25% inkomen</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'rankings' && (
          <div className="h-full overflow-y-auto p-3">
            <div className="mb-4 pt-1">
              <h2 className="text-xl font-black" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>👑 Machtsstand</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Wie heerst over het meeste grondgebied?</p>
            </div>
            <div className="space-y-1.5">
              {rankings.map((p, i) => {
                const isMe = p.id === myPlayer?.id
                const isTop = i < 3
                const rankLabel = String(i + 1).padStart(2, '0')
                const alId = (players.find(pl => pl.id === p.id) as Player & { alliance_id?: string | null })?.alliance_id
                const al = alId ? alliances.find(a => a.id === alId) : null
                const dist = p.distance_meters ?? 0
                const rankColor = i === 0 ? '#fcd34d' : i === 1 ? '#d1d5db' : i === 2 ? '#cd7c3b' : 'var(--dim)'
                const gradBg = i === 0
                  ? 'linear-gradient(135deg,#fffbeb,#fef3c7)'
                  : i === 1 ? 'linear-gradient(135deg,#f8fafc,#f1f5f9)'
                  : i === 2 ? 'linear-gradient(135deg,#fff7ed,#ffedd5)'
                  : isMe ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'var(--surface)'
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-3 rounded-xl"
                    style={{
                      background: gradBg,
                      border: `1.5px solid ${i === 0 ? '#fde68a' : i === 2 ? '#fed7aa' : isMe ? '#bfdbfe' : 'var(--border)'}`,
                      boxShadow: i < 3 ? '0 2px 8px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)',
                    }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base"
                      style={{ background: i < 3 ? ['linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#94a3b8,#64748b)','linear-gradient(135deg,#fb923c,#c2410c)'][i] : `${p.color}20` }}>
                      {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="text-xs font-black" style={{ color: 'var(--muted)' }}>{rankLabel}</span>}
                    </div>
                    <div className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{ background: p.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate leading-tight" style={{ color: 'var(--text)' }}>
                        {p.name}
                        {isMe && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#2563eb', color: '#fff' }}>jij</span>}
                        {al && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: al.color + '25', color: al.color }}>🤝</span>}
                      </p>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                        {p.location_count} posten · +{p.crown_income}/min
                        {dist > 0 && ` · ${dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl shrink-0"
                      style={{ background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--surface3)', boxShadow: i === 0 ? '0 2px 6px rgba(245,158,11,0.3)' : undefined }}>
                      <span className="font-black text-base leading-none" style={{ color: i === 0 ? '#fff' : 'var(--amber)' }}>{p.crowns}</span>
                      <span className="text-sm" style={{ color: i === 0 ? 'rgba(255,255,255,0.8)' : 'var(--dim)' }}>👑</span>
                    </div>
                  </div>
                )
              })}
              {rankings.length === 0 && <p className="mono text-xs text-center py-12" style={{ color: 'var(--dim)' }}>── GEEN DATA ──</p>}
            </div>

            {regionControl.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>── REGIO&apos;S ──</h3>
                <div className="space-y-2">
                  {regionControl.map(r => {
                    const isMine = r.controllerId === myId
                    const isContested = !r.controller && r.totalCount > 0
                    const claimed = ownership.filter(o =>
                      locations.some(l => l.id === o.location_id && (l as Location & { region_id?: string | null }).region_id === r.id)
                    ).length
                    return (
                      <div key={r.id} className="p-3 rounded-2xl transition-all"
                        style={{
                          background: isMine ? r.color + '18' : 'var(--surface)',
                          border: `1.5px solid ${isMine ? r.color + '60' : 'var(--border)'}`,
                          boxShadow: isMine ? `0 2px 10px ${r.color}25` : undefined,
                        }}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: r.color }} />
                          <p className="font-black text-sm flex-1" style={{ color: 'var(--text)' }}>{r.name}</p>
                          {isMine && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg" style={{ background: r.color, color: '#fff' }}>+25% 👑</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex gap-1 flex-1 flex-wrap">
                            {Array.from({ length: r.totalCount }).map((_, i) => {
                              const locsSorted = locations.filter(l => (l as Location & { region_id?: string | null }).region_id === r.id)
                              const loc = locsSorted[i]
                              const owner = loc ? ownership.find(o => o.location_id === loc.id) : null
                              const dotColor = owner ? (owner.player?.color ?? '#6b7280') : 'var(--border2)'
                              const isMyDot = owner?.player_id === myId
                              return (
                                <div key={i} className="w-4 h-4 rounded-full transition-all"
                                  style={{ background: dotColor, boxShadow: isMyDot ? `0 0 0 2px #fff, 0 0 0 3px ${dotColor}` : undefined }} />
                              )
                            })}
                          </div>
                          <span className="text-xs font-bold shrink-0" style={{ color: 'var(--muted)' }}>{claimed}/{r.totalCount}</span>
                        </div>
                        <p className="text-xs font-bold" style={{ color: r.controller ? r.controller.color : isContested ? 'var(--amber)' : 'var(--dim)' }}>
                          {r.controller
                            ? (isMine ? '● Jouw regio' : `● ${r.controller.name}`)
                            : r.totalCount === 0 ? '── Geen locaties ──'
                            : isContested ? '◎ Betwist'
                            : '◎ Onbezet'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {alliances.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>── ALLIANTIES ──</h3>
                <div className="space-y-2">
                  {alliances.map(al => {
                    const isMine = myAllianceId === al.id
                    const members = players.filter(p => (p as Player & { alliance_id?: string | null }).alliance_id === al.id)
                    return (
                      <div key={al.id} className="p-3 rounded-2xl transition-all"
                        style={{
                          background: isMine ? al.color + '18' : 'var(--surface)',
                          border: `1.5px solid ${isMine ? al.color + '60' : 'var(--border)'}`,
                          boxShadow: isMine ? `0 2px 10px ${al.color}25` : undefined,
                        }}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: al.color }} />
                          <p className="font-black text-sm flex-1" style={{ color: 'var(--text)' }}>{al.name}</p>
                          {isMine ? (
                            <button onClick={() => joinAlliance(null)}
                              className="text-xs px-2.5 py-1 rounded-xl font-bold transition-all"
                              style={{ background: '#fef2f2', color: '#dc2626' }}>
                              Verlaten
                            </button>
                          ) : (
                            <button onClick={() => joinAlliance(al.id)}
                              className="text-xs px-2.5 py-1 rounded-xl font-bold text-white transition-all"
                              style={{ background: al.color, boxShadow: `0 2px 6px ${al.color}40` }}>
                              Aansluiten →
                            </button>
                          )}
                        </div>
                        {members.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {members.map(m => (
                              <span key={m.id} className="text-xs px-2 py-0.5 rounded-lg font-bold"
                                style={{ background: al.color + '20', color: al.color }}>
                                {(m as Player & { avatar?: string }).avatar ?? m.name[0]} {m.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {members.length === 0 && (
                          <p className="text-xs" style={{ color: 'var(--dim)' }}>── Nog geen leden ──</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'events' && (
          <div className="h-full overflow-y-auto p-3">
            <div className="mb-3 pt-1">
              <h2 className="text-xl font-black" style={{ background: `linear-gradient(135deg, ${narratorColor}, ${narratorColor}aa)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📜 Kroniek</h2>
            </div>

            <div className="space-y-1.5">
              {events.map(ev => {
                const player = players.find(p => p.id === ev.player_id)
                const data = ev.data as Record<string, string>
                const isAdmin = ev.type === 'admin_event'
                const targetId = data.target_player_id
                if (isAdmin && targetId && targetId !== myPlayer?.id) return null

                const d = data
                const isPersonal = myNotifications.some(n => n.id === ev.id)
                const isNew = isPersonal && ev.created_at > lastEventsSeenAt
                const isMine = ev.player_id === myPlayer?.id

                const typeIcon: Record<string, string> = {
                  location_claimed: '🏴', encounter_resolved: '⚔', admin_event: '📡',
                  powerup_claimed: '⚡', crown_rain: '◈', storm: '⛈', new_round: '↺',
                  phase_change: '▶', crown_bonus: '👑', bonus_mission_won: '🎯',
                  photo_approved: '📸', photo_rejected: '📸', story: '📖',
                  crown_tick: '💰',
                }
                const pName = player?.name ?? d.player_name ?? '?'
                const pColor = player?.color ?? 'var(--text)'
                const winnerName = players.find(p => p.id === d.winner_id)?.name

                let bg = 'var(--surface)'
                let border = 'var(--border)'
                if (isAdmin)     { bg = '#fffbeb'; border = '#fde68a' }
                else if (isNew)  { bg = '#eff6ff'; border = '#93c5fd' }
                else if (isPersonal) { bg = '#f0fdf4'; border = '#bbf7d0' }

                return (
                  <div key={ev.id} className="flex gap-2.5 px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: bg, border: `1.5px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <span className="mono text-base shrink-0 w-5 text-center mt-0.5">{typeIcon[ev.type] ?? '·'}</span>
                    <div className="flex-1 min-w-0">
                      {isNew && (
                        <div className="mb-0.5">
                          <span className="mono text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded" style={{ background: '#3b82f6', color: '#fff' }}>NIEUW</span>
                        </div>
                      )}
                      {isAdmin && (
                        <>
                          <p className="font-bold text-sm" style={{ color: 'var(--amber)' }}>{d.title}</p>
                          {d.description && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{d.description}</p>}
                        </>
                      )}
                      {ev.type === 'new_round'         && <p className="font-bold" style={{ color: 'var(--accent)' }}>Nieuwe ronde gestart</p>}
                      {ev.type === 'phase_change'       && <p className="font-bold" style={{ color: 'var(--amber)' }}>Fase: {d.phase_name} — zone verkleind</p>}
                      {ev.type === 'crown_rain'         && <p className="font-bold" style={{ color: 'var(--amber)' }}>Schatkistuitdeling — alle ridders + kronen</p>}
                      {ev.type === 'storm'              && <p className="font-bold" style={{ color: '#60a5fa' }}>Veldslag — alle gebieden neutraal</p>}
                      {ev.type === 'powerup_claimed'    && <p><span className="font-bold" style={{ color: pColor }}>{pName}</span> <span style={{ color: 'var(--muted)' }}>vond</span> <span style={{ color: 'var(--amber)' }}> {d.label}</span></p>}
                      {ev.type === 'location_claimed'   && <p><span className="font-bold" style={{ color: pColor }}>{pName}</span> <span style={{ color: 'var(--muted)' }}> nam </span><span className="font-semibold" style={{ color: 'var(--text)' }}>{d.location_name}</span>{' '}{LOCATION_TYPE_CONFIG[d.location_type as LocationType]?.emoji ?? ''}</p>}
                      {ev.type === 'encounter_resolved' && <p><span style={{ color: 'var(--muted)' }}>Ontmoeting — </span>{d.winner_id ? <span className="font-bold" style={{ color: 'var(--text)' }}>winnaar: {winnerName ?? '?'}</span> : <span style={{ color: 'var(--muted)' }}>gelijkspel</span>}</p>}
                      {ev.type === 'crown_bonus'        && <p><span className="font-bold" style={{ color: pColor }}>{pName}</span><span style={{ color: 'var(--muted)' }}> ontving </span><span className="font-bold" style={{ color: 'var(--amber)' }}>+{d.amount} 👑</span>{d.reason ? <span style={{ color: 'var(--muted)' }}> — {d.reason}</span> : null}</p>}
                      {ev.type === 'bonus_mission_won'  && <p><span className="font-bold" style={{ color: pColor }}>{pName}</span><span style={{ color: 'var(--muted)' }}> won bonusmissie bij </span><span className="font-semibold" style={{ color: 'var(--text)' }}>{d.location_name}</span><span style={{ color: 'var(--amber)' }}> +{d.bonus_crowns} 👑</span></p>}
                      {ev.type === 'photo_approved'     && <p><span className="font-bold" style={{ color: isMine ? 'var(--accent)' : pColor }}>{d.player_name}</span><span style={{ color: 'var(--muted)' }}> foto goedgekeurd voor </span><span className="font-semibold" style={{ color: 'var(--text)' }}>{d.location_name}</span></p>}
                      {ev.type === 'photo_rejected'     && <p><span className="font-bold" style={{ color: pColor }}>{d.player_name}</span><span style={{ color: 'var(--muted)' }}> foto afgekeurd voor </span><span style={{ color: 'var(--text)' }}>{d.location_name}</span></p>}
                      {ev.type === 'story'              && <p><span style={{ color: 'var(--muted)' }}>Verhaal: </span><span className="font-bold" style={{ color: 'var(--text)' }}>{d.title}</span></p>}
                      {ev.type === 'crown_tick' && (() => {
                        const payouts = (ev.data as Record<string, unknown>).payouts as Record<string, number> | undefined
                        const penalties = (ev.data as Record<string, unknown>).penalties as Record<string, number> | undefined
                        const myPayout = myId && payouts ? (payouts[myId] ?? 0) : null
                        const myPenalty = myId && penalties ? (penalties[myId] ?? 0) : 0
                        const totalPlayers = (ev.data as Record<string, unknown>).total_players as number | undefined
                        return (
                          <p>
                            <span className="font-bold" style={{ color: 'var(--muted)' }}>Opgehaalde belastingen</span>
                            {myPayout !== null && myPayout > 0 && <span className="font-bold" style={{ color: 'var(--amber)' }}> +{myPayout} 👑</span>}
                            {myPenalty > 0 && <span style={{ color: 'var(--red)' }}> −{myPenalty} boete</span>}
                            {myPayout === 0 && myPenalty === 0 && <span style={{ color: 'var(--dim)' }}> — geen locaties</span>}
                            {totalPlayers && <span className="mono text-xs" style={{ color: 'var(--dim)' }}> · {totalPlayers} spelers</span>}
                          </p>
                        )
                      })()}
                      {!['admin_event','new_round','phase_change','crown_rain','storm','powerup_claimed','location_claimed','encounter_resolved','crown_bonus','bonus_mission_won','photo_approved','photo_rejected','story','crown_tick'].includes(ev.type) && (
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>{ev.type.replace(/_/g, ' ')}</p>
                      )}
                      <p className="mono text-xs mt-0.5" style={{ color: 'var(--dim)' }}>{new Date(ev.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                )
              })}
              {events.length === 0 && <p className="mono text-xs text-center py-12" style={{ color: 'var(--dim)' }}>── GEEN ACTIVITEIT ──</p>}
            </div>
          </div>
        )}
      </div>

      {/* Active buffs bar */}
      {activeBuffs.length > 0 && (
        <div className="flex gap-2 px-3 py-2 shrink-0 overflow-x-auto" style={{ borderTop: '1px solid var(--border2)', background: 'var(--surface2)' }}>
          {activeBuffs.map(buff => {
            const mins = Math.ceil((new Date(buff.expires_at).getTime() - Date.now()) / 60000)
            const tags: Record<string, { icon: string; label: string; color: string }> = {
              double_income:   { icon: '×2', label: '2X INKOMEN', color: 'var(--accent)' },
              shield:          { icon: '🛡', label: 'SCHILD',     color: 'var(--blue)'   },
              reveal_all:      { icon: 'RAD', label: 'RADAR',     color: '#67e8f9'       },
              secret_location: { icon: '🗝', label: 'GEHEIM',     color: 'var(--amber)'  },
            }
            const t = tags[buff.type] ?? { icon: '⚡', label: buff.type.toUpperCase(), color: 'var(--accent)' }
            return (
              <div key={buff.type} className="flex items-center gap-2 px-2.5 py-1 rounded whitespace-nowrap shrink-0"
                style={{ background: `${t.color}10`, border: `1px solid ${t.color}50`, color: t.color }}>
                <span className="mono font-black text-xs">{t.icon}</span>
                <span className="mono text-xs tracking-widest font-bold">{t.label}</span>
                <span className="mono text-xs font-bold px-1 rounded" style={{ background: `${t.color}20`, color: t.color }}>{mins}m</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex shrink-0 safe-area-bottom" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}>
        {([
          { key: 'map',      label: 'Territorium', icon: '🗺️' },
          { key: 'rankings', label: 'Machtsstand', icon: '👑' },
          { key: 'events',   label: 'Kroniek',     icon: '📜' },
        ] as { key: Tab; label: string; icon: string }[]).map(({ key, label, icon }) => {
          const active = tab === key
          const badge = key === 'events' && unreadCount > 0 && !active
          return (
            <button key={key}
              onClick={() => {
                setTab(key)
                if (key === 'rankings' && game) fetchRankings(game.id)
                if (key === 'events') {
                  const now = new Date().toISOString()
                  setLastEventsSeenAt(now)
                  localStorage.setItem('events_seen_at', now)
                }
              }}
              className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-all relative"
              style={{ color: active ? '#fff' : 'var(--dim)' }}>
              <div className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all relative"
                style={{ background: active ? narratorColor : undefined, boxShadow: active ? `0 2px 10px ${narratorColor}55` : undefined }}>
                <span className="text-xl leading-none relative">
                  {icon}
                  {badge && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: '#ef4444', lineHeight: 1 }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-bold">{label}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Challenge modal */}
      {selectedLocation && myPlayer && myPos && (
        <ChallengeModal
          location={selectedLocation}
          ownership={ownership.find(o => o.location_id === selectedLocation.id) ?? null}
          myPlayer={myPlayer}
          myPos={myPos}
          onClose={() => setSelectedLocation(null)}
          onSuccess={(msg) => {
            setStatusMsg(msg)
            setSelectedLocation(null)
            setTimeout(() => setStatusMsg(''), 3000)
            if (game) fetchGameData(game.id)
          }}
          onError={(msg) => {
            setStatusMsg(msg)
            setTimeout(() => setStatusMsg(''), 3000)
          }}
          onRefresh={() => { if (game) fetchGameData(game.id) }}
        />
      )}

      {/* Story overlay */}
      {storyEvent && (
        <StoryOverlay
          chapter={{ id: storyEvent.chapter_id, title: storyEvent.title, content: storyEvent.content, trigger: storyEvent.trigger as StoryChapter['trigger'] }}
          narratorId={storyEvent.narrator_id}
          onDismiss={() => setStoryEvent(null)}
        />
      )}

      {/* Encounter modal */}
      {encounter && myPlayer && (
        <EncounterModal
          encounter={encounter}
          myPlayer={myPlayer}
          players={players}
          onClose={() => setEncounter(null)}
          onResolved={(result) => {
            setStatusMsg(result.result === 'win' ? `⚔️ Gewonnen! +${result.crown_change} 👑` : result.result === 'lose' ? `😤 Verloren! ${result.crown_change} 👑` : `🤝 Gelijkspel! +${result.crown_change} 👑`)
            setEncounter(null)
            setTimeout(() => setStatusMsg(''), 3000)
            if (myPlayer && game) {
              setMyPlayer(prev => prev ? { ...prev, crowns: Math.max(0, prev.crowns + result.crown_change) } : prev)
            }
          }}
        />
      )}
    </div>
  )
}
