'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const AVATARS = [
  '🧭', '🦅', '🐺', '🦊', '🐻', '🦁', '🐯', '🦌',
  '🦝', '🦜', '🐉', '⚡', '🌙', '🔥', '🌊', '🏔️',
  '🎯', '🗡️', '🛡️', '👑', '🎪', '🌟', '🍀', '🪶',
]

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState<'join' | 'host'>('join')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('🧭')
  const [gameName, setGameName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(0)
  const [tickInterval, setTickInterval] = useState(2)
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingSession, setExistingSession] = useState<{ code: string; name: string; avatar: string } | null>(null)
  const [existingHostGame, setExistingHostGame] = useState<{ id: string; name: string; starts_at: string | null } | null>(null)
  const [kickedMsg, setKickedMsg] = useState('')

  useEffect(() => {
    const pid = localStorage.getItem('player_id')
    const ptoken = localStorage.getItem('player_token')
    const pname = localStorage.getItem('player_name')
    const pavatar = localStorage.getItem('player_avatar') ?? '🧭'
    const storedCode = localStorage.getItem('player_game_code')
    if (pid && ptoken && pname && storedCode) {
      setExistingSession({ code: storedCode, name: pname, avatar: pavatar })
    }

    const hgid = localStorage.getItem('host_game_id')
    const htoken = localStorage.getItem('host_token')
    if (hgid && htoken) {
      fetch(`/api/games/${hgid}`)
        .then(r => r.ok ? r.json() : null)
        .then(g => { if (g && g.status !== 'ended') setExistingHostGame({ id: hgid, name: g.name, starts_at: g.starts_at ?? null }) })
        .catch(() => {})
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('kicked') === '1') {
      const reason = params.get('reason')
      setKickedMsg(reason ? `Je bent uit het spel verwijderd: ${reason}` : 'Je bent uit het spel verwijderd door de spelleider.')
    }
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !name.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/players', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_code: code.trim(), name: name.trim(), avatar }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      localStorage.setItem('player_id', data.id)
      localStorage.setItem('player_token', data.token)
      localStorage.setItem('player_name', data.name)
      localStorage.setItem('player_color', data.color)
      localStorage.setItem('player_avatar', data.avatar ?? avatar)
      localStorage.setItem('player_game_code', code.trim().toUpperCase())
      router.push(`/play/${code.trim().toUpperCase()}`)
    } catch { setError('Verbinding mislukt') }
    finally { setLoading(false) }
  }

  async function handleCreateGame(e: React.FormEvent) {
    e.preventDefault()
    if (!gameName.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName.trim(), config: { duration_minutes: durationMinutes || null, crown_tick_interval_minutes: tickInterval, max_players: maxPlayers } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      localStorage.setItem('host_token', data.host_token)
      localStorage.setItem('host_game_id', data.id)
      router.push(`/host/${data.id}`)
    } catch { setError('Verbinding mislukt') }
    finally { setLoading(false) }
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '1.5px solid var(--border2)',
    color: 'var(--text)',
    borderRadius: '12px',
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Hero header */}
      <div className="shrink-0 px-6 pt-12 pb-10 text-center" style={{ background: 'linear-gradient(135deg,#2563eb 0%,#7c3aed 100%)' }}>
        <div className="text-5xl mb-3">🗺️</div>
        <h1 className="text-4xl font-black text-white mb-1 tracking-tight">Territorium</h1>
        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>Tactisch gebiedsspel voor groepen</p>
      </div>

      <div className="flex-1 px-5 pb-8 max-w-sm mx-auto w-full">

        {kickedMsg && (
          <div className="mt-4 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
            🚫 {kickedMsg}
          </div>
        )}

        {/* Host session recovery */}
        {existingHostGame && (
          <div className="mt-4 p-4 rounded-2xl slide-up" style={{ background: 'var(--surface)', border: '1.5px solid #bbf7d0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <p className="text-xs font-bold mb-2.5" style={{ color: '#16a34a' }}>Jouw lopende spel</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🏗️</span>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{existingHostGame.name}</p>
                {existingHostGame.starts_at && (
                  <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                    🕐 {new Date(existingHostGame.starts_at).toLocaleString('nl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
            <button onClick={() => router.push(`/host/${existingHostGame.id}`)}
              className="w-full py-3 font-bold text-sm rounded-xl text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 2px 10px rgba(22,163,74,0.3)' }}>
              Dashboard openen →
            </button>
            <button onClick={() => { localStorage.removeItem('host_game_id'); localStorage.removeItem('host_token'); setExistingHostGame(null) }}
              className="w-full mt-2 py-1 text-xs font-medium" style={{ color: 'var(--dim)' }}>
              Nieuw spel aanmaken
            </button>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 my-5">
          {(['join', 'host'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: tab === t
                  ? t === 'join'
                    ? 'linear-gradient(135deg,#2563eb,#7c3aed)'
                    : 'linear-gradient(135deg,#16a34a,#22c55e)'
                  : 'var(--surface)',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: tab === t ? 'none' : '1.5px solid var(--border2)',
                boxShadow: tab === t
                  ? t === 'join' ? '0 2px 10px rgba(37,99,235,0.35)' : '0 2px 10px rgba(22,163,74,0.35)'
                  : undefined,
              }}>
              {t === 'join' ? '🎮 Meedoen' : '🏗️ Spel aanmaken'}
            </button>
          ))}
        </div>

        {/* Existing session */}
        {tab === 'join' && existingSession && (
          <div className="mb-5 p-4 rounded-2xl slide-up" style={{ background: 'var(--surface)', border: '1.5px solid var(--border2)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--muted)' }}>Lopend spel</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
                {existingSession.avatar}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{existingSession.name}</p>
                <p className="text-xs font-mono font-bold" style={{ color: 'var(--muted)' }}>{existingSession.code}</p>
              </div>
            </div>
            <button onClick={() => router.push(`/play/${existingSession.code}`)}
              className="w-full py-3 font-bold text-sm rounded-xl text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 2px 10px rgba(37,99,235,0.3)' }}>
              Hervatten →
            </button>
            <button onClick={() => setExistingSession(null)} className="w-full mt-2 py-1 text-xs font-medium" style={{ color: 'var(--dim)' }}>
              Andere speler
            </button>
          </div>
        )}

        {tab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Spelcode</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="AB12CD" maxLength={6}
                className="w-full px-4 py-4 text-center text-2xl font-black font-mono tracking-[0.4em] outline-none transition-all"
                style={{ ...inputStyle, color: '#2563eb', caretColor: '#2563eb' }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Naam / Groepsnaam</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="bijv. Groep Alpha" maxLength={30}
                className="w-full px-4 py-3 outline-none transition-all"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Embleem</label>
              <div className="grid grid-cols-8 gap-1.5">
                {AVATARS.map(a => (
                  <button key={a} type="button" onClick={() => setAvatar(a)}
                    className="text-xl py-1.5 transition-all rounded-xl"
                    style={{
                      background: avatar === a ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'var(--surface)',
                      border: `1.5px solid ${avatar === a ? '#2563eb' : 'var(--border)'}`,
                      boxShadow: avatar === a ? '0 2px 8px rgba(37,99,235,0.35)' : undefined,
                      transform: avatar === a ? 'scale(1.1)' : 'scale(1)',
                    }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !code || !name}
              className="w-full py-4 font-black text-base rounded-xl text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
              {loading ? 'Verbinden…' : `${avatar} Meedoen aan spel`}
            </button>
          </form>

        ) : (
          <form onSubmit={handleCreateGame} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Naam van het spel</label>
              <input value={gameName} onChange={e => setGameName(e.target.value)}
                placeholder="bijv. Zomerkamp 2025" maxLength={100}
                className="w-full px-4 py-3 outline-none transition-all"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#16a34a')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Spelparameters</p>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Speelduur</label>
                <select value={durationMinutes} onChange={e => setDurationMinutes(+e.target.value)}
                  className="w-full px-3 py-2.5 outline-none text-sm rounded-xl"
                  style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                  <option value={0}>Onbeperkt</option>
                  <option value={30}>30 minuten</option>
                  <option value={60}>1 uur</option>
                  <option value={90}>1,5 uur</option>
                  <option value={120}>2 uur</option>
                  <option value={180}>3 uur</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Kronen elke</label>
                  <select value={tickInterval} onChange={e => setTickInterval(+e.target.value)}
                    className="w-full px-3 py-2.5 outline-none text-sm rounded-xl"
                    style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                    {[1, 2, 5, 10].map(n => <option key={n} value={n}>{n} min</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Max spelers</label>
                  <select value={maxPlayers} onChange={e => setMaxPlayers(+e.target.value)}
                    className="w-full px-3 py-2.5 outline-none text-sm rounded-xl"
                    style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
                    {[5, 10, 15, 20, 30, 40].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !gameName}
              className="w-full py-4 font-black text-base rounded-xl text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 4px 14px rgba(22,163,74,0.35)' }}>
              {loading ? 'Aanmaken…' : '🏗️ Spel aanmaken'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
