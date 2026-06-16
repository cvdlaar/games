'use client'

import { useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { StrategyType, STRATEGY_PRESETS } from '@/lib/types'

export default function GroupJoinPage() {
  const { code } = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const groupName = searchParams.get('group') ?? ''
  const groupColor = searchParams.get('color') ?? ''

  const [status, setStatus] = useState<'strategy' | 'joining' | 'error' | 'done'>('strategy')
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!groupName) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-4 max-w-xs w-full">
          <div className="text-5xl mb-2">⚠️</div>
          <p className="font-bold" style={{ color: '#dc2626' }}>Geen groepsnaam gevonden in de QR-code.</p>
          <button onClick={() => router.push('/')}
            className="mt-4 px-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            Terug naar home
          </button>
        </div>
      </div>
    )
  }

  async function joinWithStrategy() {
    if (!selectedStrategy) return
    setStatus('joining')
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_code: code.toUpperCase(),
          name: groupName,
          avatar: STRATEGY_PRESETS[selectedStrategy].emoji,
          strategy: selectedStrategy,
          ...(groupColor ? { color: groupColor } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setStatus('error'); setErrorMsg(data.error ?? 'Kan niet meedoen'); return }

      localStorage.setItem('player_id', data.id)
      localStorage.setItem('player_token', data.token)
      localStorage.setItem('player_name', data.name)
      localStorage.setItem('player_color', data.color)
      localStorage.setItem('player_avatar', data.avatar ?? STRATEGY_PRESETS[selectedStrategy].emoji)
      localStorage.setItem('player_strategy', selectedStrategy)
      localStorage.setItem('player_game_code', code.toUpperCase())

      setStatus('done')
      router.replace(`/play/${code.toUpperCase()}`)
    } catch {
      setStatus('error')
      setErrorMsg('Verbinding mislukt')
    }
  }

  if (status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-4 max-w-xs w-full">
          <div className="text-5xl mb-2">⚠️</div>
          <p className="font-bold" style={{ color: '#dc2626' }}>{errorMsg}</p>
          <button onClick={() => setStatus('strategy')}
            className="mt-4 px-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ background: '#ef4444' }}>
            ← Probeer opnieuw
          </button>
        </div>
      </div>
    )
  }

  if (status === 'joining' || status === 'done') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-4 max-w-xs w-full">
          {selectedStrategy && (
            <div className="text-5xl mb-2 animate-pulse">{STRATEGY_PRESETS[selectedStrategy].emoji}</div>
          )}
          <p className="font-bold text-lg" style={{ color: 'var(--text)' }}>{groupName}</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Verbinden met spel {code.toUpperCase()}…</p>
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mt-2"
            style={{ borderColor: selectedStrategy ? STRATEGY_PRESETS[selectedStrategy].color : '#2563eb', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  // Strategy selection screen
  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-8 pb-5 text-center">
        <div className="text-4xl mb-3">⚔️</div>
        <h1 className="font-black text-2xl mb-1" style={{ color: 'var(--text)' }}>{groupName}</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Spel <span className="font-black mono" style={{ color: 'var(--accent)' }}>{code.toUpperCase()}</span> — kies je strategie
        </p>
      </div>

      {/* Strategy cards */}
      <div className="flex-1 px-4 pb-4 space-y-3">
        {(Object.entries(STRATEGY_PRESETS) as [StrategyType, typeof STRATEGY_PRESETS[StrategyType]][]).map(([key, s]) => {
          const active = selectedStrategy === key
          return (
            <button key={key} onClick={() => setSelectedStrategy(key)}
              className="w-full text-left rounded-2xl transition-all duration-200 overflow-hidden pop-in"
              style={{
                border: `2px solid ${active ? s.color : 'var(--border)'}`,
                background: active ? `${s.color}12` : 'var(--surface)',
                boxShadow: active ? `0 4px 20px ${s.color}30` : undefined,
                transform: active ? 'scale(1.01)' : 'scale(1)',
              }}>
              <div className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                  style={{ background: active ? `${s.color}25` : 'var(--surface2)', border: `2px solid ${active ? s.color : 'var(--border)'}` }}>
                  {s.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-black text-base" style={{ color: active ? s.color : 'var(--text)' }}>{s.label}</p>
                    {active && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: s.color, color: '#fff' }}>GEKOZEN</span>
                    )}
                  </div>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>{s.tagline}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg"
                      style={{ background: active ? `${s.color}20` : 'var(--surface3)', color: active ? s.color : 'var(--dim)' }}>
                      ✦ {s.bonus}
                    </span>
                  </div>
                </div>
                <div className="w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center"
                  style={{ borderColor: active ? s.color : 'var(--border)', background: active ? s.color : 'transparent' }}>
                  {active && <span className="text-white text-xs font-black">✓</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Join button */}
      <div className="shrink-0 px-4 py-5" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={joinWithStrategy} disabled={!selectedStrategy}
          className="w-full py-4 font-black text-base rounded-2xl transition-all disabled:opacity-30"
          style={{
            background: selectedStrategy ? `linear-gradient(135deg, ${STRATEGY_PRESETS[selectedStrategy].color}, ${STRATEGY_PRESETS[selectedStrategy].color}bb)` : 'var(--surface2)',
            color: selectedStrategy ? '#fff' : 'var(--dim)',
            boxShadow: selectedStrategy ? `0 4px 20px ${STRATEGY_PRESETS[selectedStrategy].color}45` : undefined,
          }}>
          {selectedStrategy
            ? `${STRATEGY_PRESETS[selectedStrategy].emoji} Meedoen als ${STRATEGY_PRESETS[selectedStrategy].label} →`
            : 'Kies een strategie'}
        </button>
        <p className="text-center text-xs mt-3" style={{ color: 'var(--dim)' }}>
          Je strategie geeft een unieke bonus tijdens het spel
        </p>
      </div>
    </div>
  )
}
