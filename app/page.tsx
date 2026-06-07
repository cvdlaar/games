'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState<'join' | 'host'>('join')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [gameName, setGameName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_code: code.trim(), name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      localStorage.setItem('player_id', data.id)
      localStorage.setItem('player_token', data.token)
      localStorage.setItem('player_name', data.name)
      localStorage.setItem('player_color', data.color)
      router.push(`/play/${code.trim().toUpperCase()}`)
    } catch {
      setError('Verbinding mislukt')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateGame(e: React.FormEvent) {
    e.preventDefault()
    if (!gameName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      localStorage.setItem('host_token', data.host_token)
      localStorage.setItem('host_game_id', data.id)
      router.push(`/host/${data.id}`)
    } catch {
      setError('Verbinding mislukt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#0f0f1a] to-[#1a1a2e]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏕️</div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Territorium</h1>
          <p className="text-sm text-white/50 mt-1">Het scouting territoriumspel</p>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-white/10 mb-6">
          <button
            onClick={() => setTab('join')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'join' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            Meedoen
          </button>
          <button
            onClick={() => setTab('host')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'host' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            Spel aanmaken
          </button>
        </div>

        {tab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Spelcode</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="bijv. AB12CD"
                maxLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-xl font-mono tracking-widest placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Jouw naam</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Scoutsnaam"
                maxLength={30}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !code || !name}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-white transition-colors"
            >
              {loading ? 'Verbinden...' : 'Meedoen →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateGame} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Naam van het spel</label>
              <input
                value={gameName}
                onChange={e => setGameName(e.target.value)}
                placeholder="bijv. Zomerkamp 2025"
                maxLength={100}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !gameName}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-white transition-colors"
            >
              {loading ? 'Aanmaken...' : 'Spel aanmaken →'}
            </button>
            <p className="text-xs text-white/30 text-center">Voor begeleiders op laptop/tablet</p>
          </form>
        )}
      </div>
    </div>
  )
}
