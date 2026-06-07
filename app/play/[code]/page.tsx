'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Game, Location, Player, LocationOwnership, Encounter, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getDistanceMeters } from '@/lib/game-logic'
import ChallengeModal from '@/components/player/ChallengeModal'
import EncounterModal from '@/components/player/EncounterModal'

const PlayerMap = dynamic(() => import('@/components/player/PlayerMap'), { ssr: false })

type Tab = 'map' | 'rankings' | 'events'

interface RankedPlayer {
  id: string
  name: string
  color: string
  crowns: number
  location_count: number
  crown_income: number
  score: number
  rank: number
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
  const [tab, setTab] = useState<Tab>('map')
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [rankings, setRankings] = useState<RankedPlayer[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [nearbyPlayers, setNearbyPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState('')
  const [outsideGeofence, setOutsideGeofence] = useState(false)

  const playerIdRef = useRef<string>('')
  const playerTokenRef = useRef<string>('')

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

  const fetchEvents = useCallback(async (gameId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setEvents(data)
  }, [])

  useEffect(() => {
    const pid = localStorage.getItem('player_id')
    const token = localStorage.getItem('player_token')
    if (!pid || !token) { router.push('/'); return }
    playerIdRef.current = pid
    playerTokenRef.current = token

    async function init() {
      const gameRes = await fetch(`/api/games?code=${code}`)
      if (!gameRes.ok) { router.push('/'); return }
      const gameData = await gameRes.json()
      setGame(gameData)

      const fullGame = await fetchGameData(gameData.id)
      const me = fullGame.players?.find((p: Player) => p.id === pid)
      if (me) setMyPlayer(me)

      await fetchRankings(gameData.id)
      await fetchEvents(gameData.id)
      setLoading(false)

    }
    init()
  }, [code, router, fetchGameData, fetchRankings, fetchEvents, checkEncounter])

  // Realtime subscriptions — set up after game is known, separately from async init
  useEffect(() => {
    if (!game) return
    const supabase = createClient()
    const channel = supabase
      .channel(`play-rt-${game.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_ownership' }, () => fetchGameData(game.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${game.id}` }, async () => {
        await fetchGameData(game.id)
        await fetchRankings(game.id)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${game.id}` }, () => fetchEvents(game.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'encounters' }, () => checkEncounter())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [game?.id, fetchGameData, fetchRankings, fetchEvents, checkEncounter]) // eslint-disable-line react-hooks/exhaustive-deps

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
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
            const gf = (currentGame.config as { geofence?: { lat: number; lng: number; radius_meters: number } })?.geofence
            if (gf) {
              const dist = getDistanceMeters(lat, lng, gf.lat, gf.lng)
              setOutsideGeofence(dist > gf.radius_meters)
            }
          }
          return currentGame
        })

        // Check nearby players for encounters
        setPlayers(prev => {
          const nearby = prev.filter(p => {
            if (p.id === pid || !p.lat || !p.lng) return false
            return getDistanceMeters(lat, lng, p.lat, p.lng) < 50
          })
          setNearbyPlayers(nearby)
          return prev
        })
      },
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

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
      <div className="h-full flex flex-col items-center justify-center bg-[#0f0f1a] text-white gap-3">
        <div className="text-3xl animate-pulse">🗺️</div>
        <p className="text-white/50">Verbinden met spel...</p>
      </div>
    )
  }

  if (!game) return null

  // Game ended screen
  if (game.status === 'ended') {
    const sorted = rankings.length ? rankings : []
    const me = sorted.find(p => p.id === myPlayer?.id)
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#0f0f1a] text-white p-6">
        <div className="text-5xl mb-4">🏆</div>
        <h1 className="text-2xl font-bold mb-1">{game.name}</h1>
        <p className="text-white/40 mb-8">Spel beëindigd</p>
        {me && <p className="mb-6 text-lg">Jij eindigde op <span className="font-bold text-yellow-300">plek #{me.rank}</span> met <span className="font-bold text-yellow-300">{me.crowns} 👑</span></p>}
        <div className="w-full max-w-sm space-y-2">
          {sorted.slice(0, 10).map(p => (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl ${p.id === myPlayer?.id ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/5'}`}>
              <span className="text-lg w-8 text-center">{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}</span>
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-yellow-300 font-bold">{p.crowns} 👑</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const myOwnedCount = ownership.filter(o => o.player_id === myPlayer?.id).length

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a] text-white no-select">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 backdrop-blur-sm shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: myPlayer?.color ?? '#fff' }} />
          <span className="font-semibold text-sm">{myPlayer?.name ?? '...'}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/50">{myOwnedCount} 🏴</span>
          <span className="font-bold text-yellow-300">{myPlayer?.crowns ?? 0} 👑</span>
        </div>
      </div>

      {/* Game name */}
      <div className="px-4 py-1.5 text-center text-xs text-white/30 shrink-0">
        {game.name} · {game.status === 'active' ? '🟢 Actief' : game.status === 'setup' ? '⏳ Wacht op start' : '🔴 Beëindigd'}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden relative">
        {tab === 'map' && (
          <>
            <PlayerMap
              locations={locations}
              ownership={ownership}
              players={players}
              myPlayerId={myPlayer?.id ?? ''}
              myPos={myPos}
              onLocationSelect={setSelectedLocation}
            />

            {/* Geofence warning */}
            {outsideGeofence && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] w-max slide-up">
                <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
                  🚨 Je bent buiten het speelveld! Ga terug.
                </div>
              </div>
            )}

            {/* Nearby players button */}
            {nearbyPlayers.length > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] slide-up">
                <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
                  ⚠️ {nearbyPlayers.length} speler{nearbyPlayers.length > 1 ? 's' : ''} in de buurt!
                  <button
                    onClick={() => triggerEncounter(nearbyPlayers[0])}
                    className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full text-xs"
                  >
                    Aanvallen?
                  </button>
                </div>
              </div>
            )}

            {/* Status message */}
            {statusMsg && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/10 backdrop-blur text-white px-4 py-2 rounded-full text-sm slide-up">
                {statusMsg}
              </div>
            )}
          </>
        )}

        {tab === 'rankings' && (
          <div className="h-full overflow-y-auto p-4">
            <h2 className="font-bold text-lg mb-4">Ranglijst</h2>
            <div className="space-y-2">
              {rankings.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${p.id === myPlayer?.id ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/5'}`}
                >
                  <span className={`text-lg font-bold w-8 text-center ${p.rank === 1 ? 'text-yellow-400' : p.rank === 2 ? 'text-gray-300' : p.rank === 3 ? 'text-amber-600' : 'text-white/30'}`}>
                    {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                  </span>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{p.name} {p.id === myPlayer?.id && <span className="text-white/40 text-xs">(jij)</span>}</p>
                    <p className="text-xs text-white/40">{p.location_count} locaties · +{p.crown_income}/tick</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-yellow-300 text-sm">{p.crowns} 👑</p>
                    <p className="text-xs text-white/30">Score: {p.score}</p>
                  </div>
                </div>
              ))}
              {rankings.length === 0 && (
                <p className="text-white/30 text-center py-12">Nog geen data</p>
              )}
            </div>
          </div>
        )}

        {tab === 'events' && (
          <div className="h-full overflow-y-auto p-4">
            <h2 className="font-bold text-lg mb-4">Gebeurtenissen</h2>
            <div className="space-y-2">
              {events.map(ev => {
                const player = players.find(p => p.id === ev.player_id)
                const data = ev.data as Record<string, string>
                return (
                  <div key={ev.id} className="flex gap-3 p-3 bg-white/5 rounded-xl text-sm">
                    <span className="text-lg">
                      {ev.type === 'location_claimed' ? '🏴' : ev.type === 'encounter_resolved' ? '⚔️' : '📌'}
                    </span>
                    <div>
                      {ev.type === 'location_claimed' && (
                        <p>
                          <span className="font-semibold" style={{ color: player?.color ?? '#fff' }}>{player?.name ?? '?'}</span>
                          {' claimde '}<span className="text-white font-medium">{data.location_name}</span>
                          {' ('}{LOCATION_TYPE_CONFIG[data.location_type as LocationType]?.emoji}{')'}
                        </p>
                      )}
                      {ev.type === 'encounter_resolved' && (
                        <p>
                          Encounter beslecht
                          {data.winner_id ? ` · winnaar: ${players.find(p => p.id === data.winner_id)?.name ?? '?'}` : ' · gelijkspel'}
                        </p>
                      )}
                      <p className="text-white/30 text-xs mt-0.5">{new Date(ev.created_at).toLocaleTimeString('nl-NL')}</p>
                    </div>
                  </div>
                )
              })}
              {events.length === 0 && (
                <p className="text-white/30 text-center py-12">Nog geen activiteit</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="flex border-t border-white/10 shrink-0 bg-black/40 backdrop-blur-sm safe-area-bottom">
        {([
          { key: 'map', label: 'Kaart', icon: '🗺️' },
          { key: 'rankings', label: 'Ranglijst', icon: '🏆' },
          { key: 'events', label: 'Acties', icon: '📋' },
        ] as { key: Tab; label: string; icon: string }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === 'rankings' && game) fetchRankings(game.id) }}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${tab === key ? 'text-white' : 'text-white/30'}`}
          >
            <span className="text-xl">{icon}</span>
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
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
