'use client'

import { useState, useEffect } from 'react'
import { Encounter, Player, EncounterChoice, STRATEGY_PRESETS, StrategyType } from '@/lib/types'

interface Props {
  encounter: Encounter & { already_chose?: boolean }
  myPlayer: Player
  players: Player[]
  onClose: () => void
  onResolved: (result: { result: 'win' | 'lose' | 'draw'; crown_change: number }) => void
}

const CHOICES: { key: EncounterChoice; code: string; label: string; desc: string; beats: string; color: string }[] = [
  { key: 'attack', code: '⚔',  label: 'AANVALLEN',      desc: '+30 bij winst, −20 bij verlies',  beats: '✓ vs »  ✗ vs 🛡',    color: 'var(--red)'    },
  { key: 'defend', code: '🛡',  label: 'VERDEDIGEN',     desc: '+30 bij winst, −20 bij verlies',  beats: '✓ vs ⚔  = vs rest',  color: 'var(--blue)'   },
  { key: 'trade',  code: '◈',   label: 'ONDERHANDELEN',  desc: 'Altijd +15 — nooit verlies',      beats: '= altijd gelijkspel', color: 'var(--accent)' },
  { key: 'dodge',  code: '»',   label: 'TERUGTREKKEN',   desc: '+0 bij gelijkspel, −20 vs aanval',beats: '✗ vs ⚔  = vs rest',  color: 'var(--dim)'    },
]

export default function EncounterModal({ encounter, myPlayer, players, onClose, onResolved }: Props) {
  const [chosen, setChosen] = useState<EncounterChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(45)
  const [waiting, setWaiting] = useState(encounter.already_chose ?? false)

  const isInitiator = encounter.initiator_id === myPlayer.id
  const opponent = players.find(p => p.id === (isInitiator ? encounter.target_id : encounter.initiator_id))

  useEffect(() => {
    const expires = new Date(encounter.expires_at).getTime()
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) {
        clearInterval(interval)
        // Notify server to mark encounter as expired
        fetch(`/api/encounters/${encounter.id}/expire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: myPlayer.id, token: localStorage.getItem('player_token') }),
        }).catch(() => {})
        onClose()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [encounter.expires_at, encounter.id, myPlayer.id, onClose])

  async function submitChoice(choice: EncounterChoice) {
    setChosen(choice)
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayer.id, token: localStorage.getItem('player_token'), choice }),
      })
      const data = await res.json()
      if (!res.ok) return
      if (data.status === 'waiting') {
        setWaiting(true)
        setLoading(false)
        const poll = setInterval(async () => {
          const r = await fetch(`/api/encounters/${encounter.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayer.id, token: localStorage.getItem('player_token'), choice }),
          })
          const d = await r.json()
          if (d.status === 'resolved') { clearInterval(poll); onResolved({ result: d.result, crown_change: d.crown_change ?? 0 }) }
        }, 2000)
        setTimeout(() => clearInterval(poll), 45000)
      } else if (data.status === 'resolved') {
        onResolved({ result: data.result, crown_change: data.crown_change ?? 0 })
      }
    } finally {
      setLoading(false)
    }
  }

  const urgentTimer = timeLeft <= 10

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm mx-4 slide-up rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1.5px solid #fca5a5', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3" style={{ background: 'linear-gradient(145deg,#1e293b,#0f172a)', borderBottom: '1px solid rgba(239,68,68,0.25)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="mono text-[10px] font-black tracking-widest flex items-center gap-1.5" style={{ color: '#ef4444' }}>
              <span className="w-1.5 h-1.5 rounded-full blink" style={{ background: '#ef4444', display: 'inline-block' }} />
              CONTACT
            </div>
            <span className="mono font-black text-3xl tabular-nums" style={{ color: urgentTimer ? '#ef4444' : '#f59e0b' }}>
              {String(timeLeft).padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 relative"
              style={{ background: `${opponent?.color ?? '#aaa'}25`, border: `2px solid ${opponent?.color ?? '#aaa'}` }}>
              {(opponent as (Player & { avatar?: string }) | undefined)?.avatar ?? opponent?.name?.charAt(0) ?? '?'}
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                style={{ background: '#ef4444', color: '#fff' }}>!</div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg leading-tight truncate" style={{ color: '#f1f5f9' }}>{opponent?.name ?? 'ONBEKEND'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="mono text-xs" style={{ color: '#64748b' }}>{opponent?.crowns ?? 0}👑</p>
                {opponent?.strategy && STRATEGY_PRESETS[opponent.strategy as StrategyType] && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg"
                    style={{ background: `${STRATEGY_PRESETS[opponent.strategy as StrategyType].color}30`, color: STRATEGY_PRESETS[opponent.strategy as StrategyType].color }}>
                    {STRATEGY_PRESETS[opponent.strategy as StrategyType].emoji} {STRATEGY_PRESETS[opponent.strategy as StrategyType].label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="mono text-[10px] tracking-widest mt-3 font-black" style={{ color: '#475569' }}>
            KIES TACTIEK — {timeLeft}s RESTEREND
          </p>
        </div>

        <div className="p-4">
          {waiting ? (
            <div className="py-6 text-center">
              <div className="mono font-black text-4xl mb-3" style={{ color: CHOICES.find(c => c.key === chosen)?.color ?? 'var(--accent)' }}>
                {CHOICES.find(c => c.key === chosen)?.code}
              </div>
              <p className="font-bold tracking-wide" style={{ color: 'var(--text)' }}>{CHOICES.find(c => c.key === chosen)?.label}</p>
              <p className="mono text-xs tracking-widest mt-2" style={{ color: 'var(--muted)' }}>WACHT OP TEGENSTANDER...</p>
              <div className="flex gap-1 justify-center mt-3">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full blink" style={{ background: 'var(--dim)', animationDelay: `${i * 0.3}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {CHOICES.map(c => (
                  <button key={c.key} onClick={() => !loading && submitChoice(c.key)} disabled={loading}
                    className="p-3.5 rounded-xl text-left transition-all"
                    style={{
                      background: chosen === c.key ? `${c.color}18` : 'var(--surface)',
                      border: `1px solid ${chosen === c.key ? c.color : 'var(--border2)'}`,
                      boxShadow: chosen === c.key ? `0 0 12px ${c.color}25` : undefined,
                    }}>
                    <div className="mono font-black text-2xl mb-2" style={{ color: c.color }}>{c.code}</div>
                    <div className="font-black text-xs tracking-wide mb-1" style={{ color: 'var(--text)' }}>{c.label}</div>
                    <div className="mono text-[11px] leading-tight" style={{ color: 'var(--muted)' }}>{c.desc}</div>
                    <div className="mono text-[10px] mt-1.5 px-1.5 py-0.5 rounded-lg inline-block" style={{ background: `${c.color}15`, color: c.color }}>{c.beats}</div>
                  </button>
                ))}
              </div>

              <div className="mono text-[11px] text-center py-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--dim)' }}>
                ⚔ VERSLAAT » · 🛡 VERSLAAT ⚔ · ◈ ALTIJD GELIJK
              </div>
            </>
          )}

          <button onClick={onClose} className="w-full mt-3 py-2 mono text-xs tracking-widest uppercase" style={{ color: 'var(--dim)' }}>
            NEGEREN — KAN NIET ONGEDAAN
          </button>
        </div>
      </div>
    </div>
  )
}
