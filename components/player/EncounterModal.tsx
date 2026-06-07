'use client'

import { useState, useEffect } from 'react'
import { Encounter, Player, EncounterChoice } from '@/lib/types'

interface Props {
  encounter: Encounter
  myPlayer: Player
  players: Player[]
  onClose: () => void
  onResolved: (result: { result: 'win' | 'lose' | 'draw'; crown_change: number }) => void
}

const CHOICES: { key: EncounterChoice; label: string; emoji: string; description: string }[] = [
  { key: 'attack',  label: 'Aanvallen', emoji: '⚔️', description: 'Win: steel kronen + locatie' },
  { key: 'defend',  label: 'Verdedigen', emoji: '🛡️', description: 'Win: aanvaller verliest kronen' },
  { key: 'trade',   label: 'Handelen', emoji: '🤝', description: 'Allebei +15 kronen (geen risico)' },
  { key: 'dodge',   label: 'Ontwijken', emoji: '💨', description: 'Geen confrontatie, geen beloning' },
]

export default function EncounterModal({ encounter, myPlayer, players, onClose, onResolved }: Props) {
  const [chosen, setChosen] = useState<EncounterChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(45)
  const [waiting, setWaiting] = useState(false)

  const isInitiator = encounter.initiator_id === myPlayer.id
  const opponent = players.find(p => p.id === (isInitiator ? encounter.target_id : encounter.initiator_id))

  useEffect(() => {
    const expires = new Date(encounter.expires_at).getTime()
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) { clearInterval(interval); onClose() }
    }, 1000)
    return () => clearInterval(interval)
  }, [encounter.expires_at, onClose])

  async function submitChoice(choice: EncounterChoice) {
    setChosen(choice)
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: myPlayer.id,
          token: localStorage.getItem('player_token'),
          choice,
        }),
      })
      const data = await res.json()
      if (!res.ok) return
      if (data.status === 'waiting') {
        setWaiting(true)
        setLoading(false)
        // Poll for resolution
        const poll = setInterval(async () => {
          const r = await fetch(`/api/encounters/${encounter.id}`, { method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayer.id, token: localStorage.getItem('player_token'), choice }),
          })
          const d = await r.json()
          if (d.status === 'resolved') {
            clearInterval(poll)
            onResolved({ result: d.result, crown_change: d.crown_change ?? 0 })
          }
        }, 2000)
        setTimeout(() => clearInterval(poll), 45000)
      } else if (data.status === 'resolved') {
        onResolved({ result: data.result, crown_change: data.crown_change ?? 0 })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-[#1a1a2e] border border-orange-500/30 rounded-2xl p-5 slide-up">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">⚔️</div>
          <h2 className="font-bold text-xl">Encounter!</h2>
          <p className="text-white/60 text-sm mt-1">
            <span style={{ color: opponent?.color }}>●</span>
            {' '}<span className="font-semibold">{opponent?.name ?? 'Onbekend'}</span> staat naast je
          </p>
          <div className={`text-2xl font-bold mt-2 ${timeLeft <= 10 ? 'text-red-400' : 'text-orange-300'}`}>
            {timeLeft}s
          </div>
        </div>

        {waiting ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-3 animate-pulse">{CHOICES.find(c => c.key === chosen)?.emoji}</div>
            <p className="font-semibold">{CHOICES.find(c => c.key === chosen)?.label} gekozen</p>
            <p className="text-white/40 text-sm mt-2">Wachten op tegenstander...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CHOICES.map(choice => (
                <button
                  key={choice.key}
                  onClick={() => !loading && submitChoice(choice.key)}
                  disabled={loading}
                  className={`p-3 rounded-xl border transition-all text-left ${chosen === choice.key ? 'border-white/40 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="text-2xl mb-1">{choice.emoji}</div>
                  <div className="font-semibold text-sm">{choice.label}</div>
                  <div className="text-xs text-white/40">{choice.description}</div>
                </button>
              ))}
            </div>

            <div className="bg-white/5 rounded-xl p-3 text-xs text-white/50 text-center">
              ⚔️ slaat 💨 &nbsp;·&nbsp; 🛡️ slaat ⚔️ &nbsp;·&nbsp; 🤝 is altijd veilig
            </div>
          </>
        )}

        <button onClick={onClose} className="w-full mt-3 py-2 text-white/20 text-xs hover:text-white/40 transition-colors">
          Negeren (je verliest de kans)
        </button>
      </div>
    </div>
  )
}
