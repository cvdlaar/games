'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const AVATARS = [
  '🧭', '🦅', '🐺', '🦊', '🐻', '🦁', '🐯', '🦌',
  '🦝', '🦜', '🐉', '⚡', '🌙', '🔥', '🌊', '🏔️',
  '🎯', '🗡️', '🛡️', '👑', '🎪', '🌟', '🍀', '🪶',
]

export default function DirectJoinPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const gameCode = code.toUpperCase()

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('🧭')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [gameName, setGameName] = useState<string | null>(null)
  const [gameNotFound, setGameNotFound] = useState(false)

  // Check for existing session or fetch game info
  useEffect(() => {
    const pid = localStorage.getItem('player_id')
    const ptoken = localStorage.getItem('player_token')
    const storedCode = localStorage.getItem('player_game_code')
    if (pid && ptoken && storedCode === gameCode) {
      router.replace(`/play/${gameCode}`)
      return
    }
    const savedName = localStorage.getItem('player_name')
    const savedAvatar = localStorage.getItem('player_avatar')
    if (savedName) setName(savedName)
    if (savedAvatar) setAvatar(savedAvatar)

    async function fetchGame() {
      try {
        const res = await fetch(`/api/games?code=${gameCode}`)
        if (!res.ok) { setGameNotFound(true); return }
        const data = await res.json()
        setGameName(data.name)
      } catch {
        setGameNotFound(true)
      } finally {
        setChecking(false)
      }
    }
    fetchGame()
  }, [gameCode, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_code: gameCode, name: name.trim(), avatar }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Iets ging mis'); return }
      localStorage.setItem('player_id', data.id)
      localStorage.setItem('player_token', data.token)
      localStorage.setItem('player_name', data.name)
      localStorage.setItem('player_color', data.color)
      localStorage.setItem('player_avatar', data.avatar ?? avatar)
      localStorage.setItem('player_game_code', gameCode)
      router.push(`/play/${gameCode}`)
    } catch { setError('Verbinding mislukt') }
    finally { setLoading(false) }
  }

  if (checking) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-t-transparent animate-spin" style={{ borderColor: '#2563eb', borderTopColor: 'transparent', borderWidth: '3px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Spel ophalen…</p>
        </div>
      </div>
    )
  }

  if (gameNotFound) {
    return (
      <div className="h-full flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">🗺️</div>
          <h1 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Spel niet gevonden</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Code <span className="font-bold" style={{ color: 'var(--text)' }}>{gameCode}</span> bestaat niet of is al beëindigd.</p>
          <button onClick={() => router.push('/')} className="w-full py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            Terug naar home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Gradient header */}
      <div className="shrink-0 px-6 pt-12 pb-8 text-center" style={{ background: 'linear-gradient(135deg,#2563eb 0%,#7c3aed 100%)' }}>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
          🎮 Uitnodiging
        </div>
        <h1 className="text-3xl font-black text-white mb-1">{gameName ?? 'Territorium'}</h1>
        <div className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
          Code: {gameCode}
        </div>
      </div>

      <div className="flex-1 px-5 py-6 max-w-sm mx-auto w-full">
        <form onSubmit={handleJoin} className="space-y-5">
          {/* Name input */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Jouw naam</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Voer je naam in…"
              maxLength={20}
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
            />
          </div>

          {/* Avatar picker */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Kies een avatar</label>
            <div className="grid grid-cols-8 gap-1.5">
              {AVATARS.map(av => (
                <button key={av} type="button" onClick={() => setAvatar(av)}
                  className="w-full aspect-square rounded-xl text-xl flex items-center justify-center transition-all"
                  style={{
                    background: avatar === av ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'var(--surface)',
                    border: `2px solid ${avatar === av ? '#2563eb' : 'var(--border)'}`,
                    boxShadow: avatar === av ? '0 2px 8px rgba(37,99,235,0.3)' : undefined,
                    transform: avatar === av ? 'scale(1.1)' : undefined,
                  }}>
                  {av}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !name.trim()}
            className="w-full py-4 rounded-xl font-black text-base text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
            {loading ? 'Bezig…' : '🚀 Deelnemen aan spel'}
          </button>
        </form>

        <button onClick={() => router.push('/')} className="w-full mt-4 py-2 text-sm font-medium" style={{ color: 'var(--muted)' }}>
          Andere code invoeren
        </button>
      </div>
    </div>
  )
}
