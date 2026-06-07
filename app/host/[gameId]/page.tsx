'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Game, Location, Player, LocationOwnership, LocationType, ChallengeType, LOCATION_TYPE_CONFIG } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const HostMap = dynamic(() => import('@/components/host/HostMap'), { ssr: false })

type Tab = 'setup' | 'live' | 'players' | 'settings'
type SetupMode = 'list' | 'addManual' | 'addOsm' | 'geofence'

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
  const [geofence, setGeofence] = useState<{ lat: number; lng: number; radius_meters: number } | null>(null)
  const [geofenceRadius, setGeofenceRadius] = useState(1000)
  const [tickStatus, setTickStatus] = useState('')
  const [timeLeft, setTimeLeft] = useState<string>('')
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`)
    const data = await res.json()
    if (!res.ok) { setSavingStatus(`Fout: ${data.error ?? res.status}`); setLoading(false); return }
    setGame(data)
    // Restore geofence from config
    if (data.config?.geofence) setGeofence(data.config.geofence)
    setLoading(false)
  }, [gameId])

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
    const update = () => {
      const left = new Date(game.ends_at!).getTime() - Date.now()
      if (left <= 0) { setTimeLeft('00:00'); endGame(); return }
      const m = Math.floor(left / 60000)
      const s = Math.floor((left % 60000) / 1000)
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [game?.ends_at]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveGeofence(lat: number, lng: number) {
    const newGeofence = { lat, lng, radius_meters: geofenceRadius }
    setGeofence(newGeofence)
    const currentConfig = game?.config ?? {}
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_token: hostToken, config: { ...currentConfig, geofence: newGeofence } }),
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

  async function fetchOsm(lat: number, lng: number) {
    setOsmLoading(true)
    const res = await fetch('/api/osm-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius_meters: osmRadius }),
    })
    if (res.ok) {
      const data = await res.json()
      setOsmCandidates(data)
      setSelectedOsmIds(new Set(data.map((c: OsmCandidate) => c.id)))
    }
    setOsmLoading(false)
  }

  if (loading) return <div className="h-full flex items-center justify-center text-white/40">Laden...</div>
  if (!game) return null

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}` : ''
  const config = game.config as Record<string, unknown>

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h1 className="font-bold text-lg">{game.name}</h1>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-yellow-300">{game.code}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${game.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : game.status === 'ended' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'}`}>
              {game.status === 'setup' ? 'Voorbereiding' : game.status === 'active' ? '🟢 Actief' : '🔴 Beëindigd'}
            </span>
            {timeLeft && <span className="text-orange-300 font-mono font-bold">⏱ {timeLeft}</span>}
            {tickStatus && <span className="text-emerald-400 text-xs">{tickStatus}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {game.status === 'active' && (
            <button onClick={manualTick} className="px-3 py-2 bg-yellow-600/80 hover:bg-yellow-600 rounded-lg font-semibold text-xs transition-colors">
              👑 Tick
            </button>
          )}
          {game.status === 'setup' && (
            <button onClick={startGame} disabled={game.locations.length === 0} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg font-semibold text-sm transition-colors">
              ▶ Start spel
            </button>
          )}
          {game.status === 'active' && (
            <button onClick={endGame} className="px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg font-semibold text-sm transition-colors">
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {/* Join info */}
      <div className="px-4 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 text-xs shrink-0 flex items-center gap-2">
        <span className="text-white/40">Spelers joinen via</span>
        <span className="text-white font-mono">{joinUrl}</span>
        <span className="text-white/40">code:</span>
        <span className="text-yellow-300 font-bold font-mono text-sm">{game.code}</span>
        {savingStatus && <span className="ml-auto text-white/50">{savingStatus}</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['setup', 'live', 'players', 'settings'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
            {t === 'setup' ? `Locaties (${game.locations.length})` : t === 'live' ? 'Live' : t === 'players' ? `Spelers (${game.players.length})` : 'Instellingen'}
          </button>
        ))}
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
                addingMode={setupMode === 'addManual'}
                drawingGeofence={setupMode === 'geofence'}
                geofence={geofence}
                osmCandidates={setupMode === 'addOsm' ? osmCandidates : []}
                selectedOsmIds={selectedOsmIds}
                onOsmCandidateClick={c => setSelectedOsmIds(prev => {
                  const next = new Set(prev)
                  next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                  return next
                })}
                onMapClick={(lat, lng) => {
                  if (setupMode === 'addManual') { setPendingLocation({ lat, lng }); setLocationForm({ type: 'checkpoint', challenge_type: 'checkin', claim_radius: 50 }) }
                  if (setupMode === 'addOsm' && osmCandidates.length === 0) fetchOsm(lat, lng)
                }}
                onGeofenceSet={saveGeofence}
                pendingLocation={pendingLocation}
                onDeleteLocation={deleteLocation}
              />

              {/* Toolbar */}
              <div className="absolute bottom-4 left-4 z-[1000] flex gap-2 flex-wrap">
                <button
                  onClick={() => { setSetupMode(setupMode === 'addManual' ? 'list' : 'addManual'); setPendingLocation(null) }}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm shadow-lg transition-colors backdrop-blur ${setupMode === 'addManual' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {setupMode === 'addManual' ? '✕ Stop' : '+ Handmatig'}
                </button>
                <button
                  onClick={() => { setSetupMode(setupMode === 'addOsm' ? 'list' : 'addOsm'); setOsmCandidates([]) }}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm shadow-lg transition-colors backdrop-blur ${setupMode === 'addOsm' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {setupMode === 'addOsm' ? '✕ Stop' : '🗺 OSM import'}
                </button>
                <button
                  onClick={() => setSetupMode(setupMode === 'geofence' ? 'list' : 'geofence')}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm shadow-lg transition-colors backdrop-blur ${setupMode === 'geofence' ? 'bg-orange-500 text-white' : geofence ? 'bg-emerald-600/80 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {setupMode === 'geofence' ? '✕ Stop' : geofence ? '✅ Geofence' : '🔵 Geofence'}
                </button>
              </div>
            </div>

            {/* Right panel */}
            <div className="w-80 border-l border-white/10 bg-[#0f0f1a] overflow-y-auto">

              {/* Manual add form */}
              {setupMode === 'addManual' && pendingLocation && (
                <div className="p-4 space-y-3 text-sm">
                  <h3 className="font-bold">Nieuwe locatie</h3>
                  <input placeholder="Naam" value={locationForm.name ?? ''} onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
                  <textarea placeholder="Beschrijving" value={locationForm.description ?? ''} onChange={e => setLocationForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none" />
                  <div>
                    <label className="block text-white/50 mb-1">Type</label>
                    <select value={locationForm.type ?? 'checkpoint'} onChange={e => setLocationForm(f => ({ ...f, type: e.target.value as LocationType }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none">
                      {(Object.entries(LOCATION_TYPE_CONFIG) as [LocationType, typeof LOCATION_TYPE_CONFIG[LocationType]][]).map(([k, v]) => (
                        <option key={k} value={k}>{v.emoji} {v.label} (+{v.crownValue}/tick)</option>
                      ))}
                    </select>
                    <p className="text-white/30 text-xs mt-1">{LOCATION_TYPE_CONFIG[(locationForm.type as LocationType) ?? 'checkpoint'].description}</p>
                  </div>
                  <div>
                    <label className="block text-white/50 mb-1">Uitdaging</label>
                    <select value={locationForm.challenge_type ?? 'checkin'} onChange={e => setLocationForm(f => ({ ...f, challenge_type: e.target.value as ChallengeType }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none">
                      <option value="checkin">Check-in</option>
                      <option value="quiz">Quiz</option>
                      <option value="photo">Foto</option>
                      <option value="puzzle">Puzzel</option>
                      <option value="timed">Tijdslimiet</option>
                    </select>
                  </div>
                  {(locationForm.challenge_type === 'quiz' || locationForm.challenge_type === 'puzzle') && (<>
                    <input placeholder="Vraag" value={(locationForm.challenge_data as { question?: string })?.question ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), question: e.target.value } }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none" />
                    <input placeholder="Antwoord" value={(locationForm.challenge_data as { answer?: string })?.answer ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { ...(f.challenge_data ?? {}), answer: e.target.value } }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none" />
                  </>)}
                  {locationForm.challenge_type === 'photo' && (
                    <input placeholder="Foto opdracht" value={(locationForm.challenge_data as { photo_prompt?: string })?.photo_prompt ?? ''} onChange={e => setLocationForm(f => ({ ...f, challenge_data: { photo_prompt: e.target.value } }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none" />
                  )}
                  <div>
                    <label className="block text-white/50 mb-1">Radius: {locationForm.claim_radius ?? 50}m</label>
                    <input type="range" min={20} max={200} step={10} value={locationForm.claim_radius ?? 50} onChange={e => setLocationForm(f => ({ ...f, claim_radius: +e.target.value }))} className="w-full" />
                  </div>
                  <button onClick={saveLocation} disabled={!locationForm.name} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg font-semibold transition-colors">Opslaan</button>
                </div>
              )}

              {/* OSM import panel */}
              {setupMode === 'addOsm' && (
                <div className="p-4 space-y-3 text-sm">
                  <h3 className="font-bold">OpenStreetMap import</h3>
                  {osmCandidates.length === 0 ? (
                    <>
                      <p className="text-white/50">Klik op de kaart om locaties op te halen in dat gebied.</p>
                      <div>
                        <label className="block text-white/50 mb-1">Zoekradius: {osmRadius}m</label>
                        <input type="range" min={200} max={2000} step={100} value={osmRadius} onChange={e => setOsmRadius(+e.target.value)} className="w-full" />
                      </div>
                      {osmLoading && <p className="text-white/40 text-center py-4">Ophalen...</p>}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-white/60">{selectedOsmIds.size}/{osmCandidates.length} geselecteerd</p>
                        <button onClick={() => setSelectedOsmIds(selectedOsmIds.size === osmCandidates.length ? new Set() : new Set(osmCandidates.map(c => c.id)))} className="text-xs text-indigo-400 hover:text-indigo-300">
                          {selectedOsmIds.size === osmCandidates.length ? 'Geen' : 'Alles'}
                        </button>
                      </div>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {osmCandidates.map(c => {
                          const sel = selectedOsmIds.has(c.id)
                          const cfg = LOCATION_TYPE_CONFIG[c.type]
                          return (
                            <button key={c.id} onClick={() => setSelectedOsmIds(prev => { const n = new Set(prev); sel ? n.delete(c.id) : n.add(c.id); return n })}
                              className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${sel ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-white/5 border border-transparent'}`}>
                              <span className="text-base">{cfg.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{c.name}</p>
                                <p className="text-xs text-white/40">{cfg.label}</p>
                              </div>
                              <span className={`text-lg ${sel ? 'text-emerald-400' : 'text-white/20'}`}>{sel ? '✓' : '○'}</span>
                            </button>
                          )
                        })}
                      </div>
                      <button onClick={importOsmSelected} disabled={selectedOsmIds.size === 0} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg font-semibold transition-colors">
                        {selectedOsmIds.size} locaties importeren
                      </button>
                      <button onClick={() => { setOsmCandidates([]); setSelectedOsmIds(new Set()) }} className="w-full py-1.5 text-white/30 text-xs">Opnieuw zoeken</button>
                    </>
                  )}
                </div>
              )}

              {/* Geofence panel */}
              {setupMode === 'geofence' && (
                <div className="p-4 space-y-3 text-sm">
                  <h3 className="font-bold">Speelveld instellen</h3>
                  <p className="text-white/50">Klik op de kaart om het middelpunt van het speelveld te kiezen.</p>
                  <div>
                    <label className="block text-white/50 mb-1">Radius: {geofenceRadius}m</label>
                    <input type="range" min={200} max={5000} step={100} value={geofenceRadius} onChange={e => setGeofenceRadius(+e.target.value)} className="w-full" />
                  </div>
                  {geofence && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <p className="text-emerald-400 font-semibold">✅ Geofence actief</p>
                      <p className="text-white/50 text-xs mt-1">Radius: {geofence.radius_meters}m · Spelers buiten dit gebied worden gewaarschuwd</p>
                    </div>
                  )}
                  {geofence && (
                    <button onClick={async () => {
                      setGeofence(null)
                      const cfg = { ...(game?.config ?? {}), geofence: null }
                      await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_token: hostToken, config: cfg }) })
                      setSetupMode('list')
                    }} className="w-full py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg text-xs font-semibold transition-colors">
                      Geofence verwijderen
                    </button>
                  )}
                </div>
              )}

              {/* Location list */}
              {setupMode === 'list' && (
                <div className="p-3">
                  <h3 className="font-semibold text-sm text-white/50 mb-3">LOCATIES ({game.locations.length})</h3>
                  {game.locations.length === 0 && <p className="text-sm text-white/30 text-center py-8">Gebruik de knoppen op de kaart om locaties toe te voegen</p>}
                  {game.locations.map(loc => {
                    const cfg = LOCATION_TYPE_CONFIG[loc.type as LocationType]
                    const owner = game.location_ownership.find(o => o.location_id === loc.id)
                    return (
                      <div key={loc.id} className="flex items-start justify-between p-2.5 rounded-lg hover:bg-white/5 group">
                        <div className="flex gap-2.5">
                          <span className="text-lg">{cfg.emoji}</span>
                          <div>
                            <p className="font-medium text-sm">{loc.name}</p>
                            <p className="text-xs text-white/40">{cfg.label} · +{loc.crown_value}/tick</p>
                            {owner && <p className="text-xs mt-0.5" style={{ color: owner.player?.color }}>● {owner.player?.name}</p>}
                          </div>
                        </div>
                        <button onClick={() => deleteLocation(loc.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-1 py-0.5 rounded transition-all">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LIVE TAB ── */}
        {tab === 'live' && (
          <div className="h-full relative">
            <HostMap locations={game.locations} ownership={game.location_ownership} players={game.players} addingMode={false} onMapClick={() => {}} pendingLocation={null} onDeleteLocation={() => {}} liveMode geofence={geofence} />
            <div className="absolute top-3 right-3 z-[1000] bg-black/60 backdrop-blur rounded-xl p-3 text-sm space-y-1">
              <p className="text-white/50 text-xs font-semibold uppercase">Live scores</p>
              {game.players.sort((a, b) => b.crowns - a.crowns).slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-white/30 text-xs w-4">#{i + 1}</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-white text-xs flex-1">{p.name}</span>
                  <span className="text-yellow-300 text-xs font-bold">{p.crowns}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PLAYERS TAB ── */}
        {tab === 'players' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-2xl space-y-2">
              {game.players.length === 0 && <p className="text-white/30 text-center py-12">Nog geen spelers · code: <span className="text-yellow-300 font-mono">{game.code}</span></p>}
              {game.players.sort((a, b) => b.crowns - a.crowns).map((player, i) => {
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
                      <p className={`text-xs ${player.is_active ? 'text-emerald-400' : 'text-white/30'}`}>{player.is_active ? 'Actief' : 'Inactief'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-lg space-y-6">
              <div>
                <h3 className="font-bold mb-3">Spelname</h3>
                <div className="flex gap-2">
                  <input defaultValue={game.name} id="game-name-input" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30" />
                  <button onClick={() => saveSettings({ name: (document.getElementById('game-name-input') as HTMLInputElement).value })} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-sm">Opslaan</button>
                </div>
              </div>
              <div>
                <h3 className="font-bold mb-3">Spelduur</h3>
                <div className="flex gap-2 items-center">
                  <select defaultValue={(config?.duration_minutes as number) ?? 0} id="duration-input"
                    onChange={e => saveSettings({ config: { ...config, duration_minutes: +e.target.value || null } })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none">
                    <option value={0}>Onbeperkt</option>
                    <option value={30}>30 minuten</option>
                    <option value={60}>1 uur</option>
                    <option value={90}>1,5 uur</option>
                    <option value={120}>2 uur</option>
                    <option value={180}>3 uur</option>
                  </select>
                  <p className="text-white/40 text-sm">Spel eindigt automatisch</p>
                </div>
              </div>
              <div>
                <h3 className="font-bold mb-3">Crown tick interval</h3>
                <select defaultValue={(config?.crown_tick_interval_minutes as number) ?? 2} onChange={e => saveSettings({ config: { ...config, crown_tick_interval_minutes: +e.target.value } })}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none">
                  <option value={1}>Elke minuut</option>
                  <option value={2}>Elke 2 minuten</option>
                  <option value={5}>Elke 5 minuten</option>
                  <option value={10}>Elke 10 minuten</option>
                </select>
              </div>
              <div>
                <h3 className="font-bold mb-3">Max spelers</h3>
                <select defaultValue={(config?.max_players as number) ?? 20} onChange={e => saveSettings({ config: { ...config, max_players: +e.target.value } })}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none">
                  {[5, 10, 15, 20, 30, 40].map(n => <option key={n} value={n}>{n} spelers</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
