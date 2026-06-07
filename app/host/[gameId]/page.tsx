'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Game, Location, Player, LocationOwnership, LocationType, ChallengeType, LOCATION_TYPE_CONFIG } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const HostMap = dynamic(() => import('@/components/host/HostMap'), { ssr: false })

type Tab = 'setup' | 'live' | 'players'

interface FullGame extends Game {
  locations: Location[]
  players: Player[]
  location_ownership: (LocationOwnership & { player: Player })[]
}

export default function HostDashboard() {
  const { gameId } = useParams<{ gameId: string }>()
  const router = useRouter()
  const [game, setGame] = useState<FullGame | null>(null)
  const [tab, setTab] = useState<Tab>('setup')
  const [loading, setLoading] = useState(true)
  const [hostToken, setHostToken] = useState('')
  const [addingLocation, setAddingLocation] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationForm, setLocationForm] = useState<Partial<Location> & { host_token?: string }>({})
  const [savingStatus, setSavingStatus] = useState('')

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`)
    if (!res.ok) { router.push('/'); return }
    const data = await res.json()
    setGame(data)
    setLoading(false)
  }, [gameId, router])

  useEffect(() => {
    const token = localStorage.getItem('host_token') ?? ''
    setHostToken(token)
    fetchGame()
  }, [fetchGame])

  useEffect(() => {
    if (!game) return
    const supabase = createClient()
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, fetchGame)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_ownership' }, fetchGame)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [game, gameId, fetchGame])

  async function startGame() {
    setSavingStatus('Starten...')
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, status: 'active', starts_at: new Date().toISOString() }),
    })
    await fetchGame()
    setSavingStatus('')
    setTab('live')
  }

  async function endGame() {
    if (!confirm('Spel beëindigen?')) return
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, status: 'ended', ends_at: new Date().toISOString() }),
    })
    await fetchGame()
  }

  async function saveLocation() {
    if (!pendingLocation || !locationForm.name) return
    setSavingStatus('Opslaan...')
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_token: hostToken,
        game_id: gameId,
        lat: pendingLocation.lat,
        lng: pendingLocation.lng,
        name: locationForm.name,
        description: locationForm.description ?? '',
        type: locationForm.type ?? 'checkpoint',
        challenge_type: locationForm.challenge_type ?? 'checkin',
        challenge_data: locationForm.challenge_data ?? {},
        claim_radius: locationForm.claim_radius ?? 50,
        crown_value: LOCATION_TYPE_CONFIG[locationForm.type as LocationType ?? 'checkpoint'].crownValue,
      }),
    })
    if (res.ok) {
      setPendingLocation(null)
      setLocationForm({})
      setAddingLocation(false)
      await fetchGame()
    }
    setSavingStatus('')
  }

  async function deleteLocation(id: string) {
    await fetch(`/api/locations/${id}?host_token=${hostToken}`, { method: 'DELETE' })
    await fetchGame()
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-white/40">Laden...</div>
  }
  if (!game) return null

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}` : ''

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h1 className="font-bold text-lg">{game.name}</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-yellow-300">{game.code}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${game.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : game.status === 'ended' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'}`}>
              {game.status === 'setup' ? 'Voorbereiding' : game.status === 'active' ? 'Actief' : 'Beëindigd'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {game.status === 'setup' && (
            <button onClick={startGame} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold text-sm transition-colors">
              ▶ Start spel
            </button>
          )}
          {game.status === 'active' && (
            <button onClick={endGame} className="px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg font-semibold text-sm transition-colors">
              ■ Stop spel
            </button>
          )}
        </div>
      </div>

      {/* Join info */}
      <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20 text-sm shrink-0">
        <span className="text-white/50">Spelers joinen via: </span>
        <span className="text-white font-mono">{joinUrl}</span>
        <span className="text-white/50"> met code </span>
        <span className="text-yellow-300 font-bold font-mono">{game.code}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['setup', 'live', 'players'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
            {t === 'setup' ? `Locaties (${game.locations.length})` : t === 'live' ? 'Live kaart' : `Spelers (${game.players.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'setup' && (
          <div className="h-full flex">
            {/* Map */}
            <div className="flex-1 relative">
              <HostMap
                locations={game.locations}
                ownership={game.location_ownership}
                addingMode={addingLocation}
                onMapClick={(lat, lng) => {
                  if (addingLocation) {
                    setPendingLocation({ lat, lng })
                    setLocationForm({ type: 'checkpoint', challenge_type: 'checkin', claim_radius: 50 })
                  }
                }}
                pendingLocation={pendingLocation}
                onDeleteLocation={deleteLocation}
              />
              <div className="absolute bottom-4 left-4 z-[1000]">
                <button
                  onClick={() => { setAddingLocation(!addingLocation); setPendingLocation(null) }}
                  className={`px-4 py-2.5 rounded-xl font-semibold text-sm shadow-lg transition-colors ${addingLocation ? 'bg-orange-500 text-white' : 'bg-white/10 backdrop-blur text-white hover:bg-white/20'}`}
                >
                  {addingLocation ? '✕ Annuleren' : '+ Locatie toevoegen'}
                </button>
              </div>
            </div>

            {/* Location form */}
            {pendingLocation && (
              <div className="w-80 border-l border-white/10 p-4 overflow-y-auto bg-[#0f0f1a]">
                <h3 className="font-bold mb-4">Nieuwe locatie</h3>
                <div className="space-y-3 text-sm">
                  <input
                    placeholder="Naam"
                    value={locationForm.name ?? ''}
                    onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                  <textarea
                    placeholder="Beschrijving (optioneel)"
                    value={locationForm.description ?? ''}
                    onChange={e => setLocationForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
                  />
                  <div>
                    <label className="block text-white/50 mb-1">Type locatie</label>
                    <select
                      value={locationForm.type ?? 'checkpoint'}
                      onChange={e => setLocationForm(f => ({ ...f, type: e.target.value as LocationType, crown_value: LOCATION_TYPE_CONFIG[e.target.value as LocationType].crownValue }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none"
                    >
                      {(Object.entries(LOCATION_TYPE_CONFIG) as [LocationType, typeof LOCATION_TYPE_CONFIG[LocationType]][]).map(([k, v]) => (
                        <option key={k} value={k}>{v.emoji} {v.label} (+{v.crownValue}/tick)</option>
                      ))}
                    </select>
                    <p className="text-white/30 text-xs mt-1">{LOCATION_TYPE_CONFIG[locationForm.type as LocationType ?? 'checkpoint'].ability} • {LOCATION_TYPE_CONFIG[locationForm.type as LocationType ?? 'checkpoint'].description}</p>
                  </div>
                  <div>
                    <label className="block text-white/50 mb-1">Uitdaging type</label>
                    <select
                      value={locationForm.challenge_type ?? 'checkin'}
                      onChange={e => setLocationForm(f => ({ ...f, challenge_type: e.target.value as ChallengeType }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="checkin">Check-in (simpel)</option>
                      <option value="quiz">Quiz vraag</option>
                      <option value="photo">Foto opdracht</option>
                      <option value="puzzle">Puzzel / raadsel</option>
                      <option value="timed">Tijdslimiet</option>
                    </select>
                  </div>
                  {(locationForm.challenge_type === 'quiz' || locationForm.challenge_type === 'puzzle') && (
                    <>
                      <input
                        placeholder="Vraag / opdracht"
                        value={(locationForm.challenge_data as { question?: string })?.question ?? ''}
                        onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), question: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none"
                      />
                      <input
                        placeholder="Antwoord"
                        value={(locationForm.challenge_data as { answer?: string })?.answer ?? ''}
                        onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), answer: e.target.value } }))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none"
                      />
                    </>
                  )}
                  {locationForm.challenge_type === 'photo' && (
                    <input
                      placeholder="Foto opdracht beschrijving"
                      value={(locationForm.challenge_data as { photo_prompt?: string })?.photo_prompt ?? ''}
                      onChange={e => setLocationForm(f => ({ ...f, challenge_data: { photo_prompt: e.target.value } }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none"
                    />
                  )}
                  <div>
                    <label className="block text-white/50 mb-1">Claim radius: {locationForm.claim_radius}m</label>
                    <input
                      type="range" min={20} max={200} step={10}
                      value={locationForm.claim_radius ?? 50}
                      onChange={e => setLocationForm(f => ({ ...f, claim_radius: +e.target.value }))}
                      className="w-full"
                    />
                  </div>
                  <button
                    onClick={saveLocation}
                    disabled={!locationForm.name}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg font-semibold transition-colors"
                  >
                    {savingStatus || 'Locatie opslaan'}
                  </button>
                </div>
              </div>
            )}

            {/* Location list when not adding */}
            {!pendingLocation && (
              <div className="w-72 border-l border-white/10 p-3 overflow-y-auto bg-[#0f0f1a]">
                <h3 className="font-semibold text-sm text-white/50 mb-3">LOCATIES ({game.locations.length})</h3>
                {game.locations.length === 0 && (
                  <p className="text-sm text-white/30 text-center py-8">Klik op de kaart om locaties toe te voegen</p>
                )}
                {game.locations.map(loc => {
                  const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
                  const owner = game.location_ownership.find(o => o.location_id === loc.id)
                  return (
                    <div key={loc.id} className="flex items-start justify-between p-2.5 rounded-lg hover:bg-white/5 group">
                      <div className="flex gap-2.5">
                        <span className="text-lg">{config.emoji}</span>
                        <div>
                          <p className="font-medium text-sm">{loc.name}</p>
                          <p className="text-xs text-white/40">{config.label} • +{loc.crown_value}/tick</p>
                          {owner && (
                            <p className="text-xs mt-0.5" style={{ color: owner.player?.color }}>
                              ● {owner.player?.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteLocation(loc.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-1.5 py-0.5 rounded transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'live' && (
          <div className="h-full relative">
            <HostMap
              locations={game.locations}
              ownership={game.location_ownership}
              players={game.players}
              addingMode={false}
              onMapClick={() => {}}
              pendingLocation={null}
              onDeleteLocation={() => {}}
              liveMode
            />
          </div>
        )}

        {tab === 'players' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-2xl space-y-2">
              {game.players.length === 0 && (
                <p className="text-white/30 text-center py-12">Nog geen spelers. Deel de code: <span className="text-yellow-300 font-mono">{game.code}</span></p>
              )}
              {game.players
                .sort((a, b) => b.crowns - a.crowns)
                .map((player, i) => {
                  const ownedCount = game.location_ownership.filter(o => o.player_id === player.id).length
                  return (
                    <div key={player.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                      <span className="text-white/30 text-sm w-6 text-right">#{i + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: player.color }} />
                      <div className="flex-1">
                        <p className="font-semibold">{player.name}</p>
                        <p className="text-xs text-white/40">{ownedCount} locaties</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-yellow-300">{player.crowns} 👑</p>
                        <p className={`text-xs ${player.is_active ? 'text-emerald-400' : 'text-white/30'}`}>
                          {player.is_active ? 'Actief' : 'Inactief'}
                        </p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
