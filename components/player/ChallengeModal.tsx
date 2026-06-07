'use client'

import { useState } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'
import { getDistanceMeters } from '@/lib/game-logic'

interface Props {
  location: Location
  ownership: (LocationOwnership & { player: Player }) | null
  myPlayer: Player
  myPos: { lat: number; lng: number }
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export default function ChallengeModal({ location, ownership, myPlayer, myPos, onClose, onSuccess, onError }: Props) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'info' | 'challenge'>('info')

  const config = LOCATION_TYPE_CONFIG[location.type as LocationType]
  const distance = Math.round(getDistanceMeters(myPos.lat, myPos.lng, location.lat, location.lng))
  const inRange = distance <= location.claim_radius
  const isOwned = !!ownership
  const isMine = ownership?.player_id === myPlayer.id
  const challengeData = location.challenge_data as { question?: string; photo_prompt?: string; answer?: string }

  async function submitClaim() {
    setLoading(true)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: myPlayer.id,
          token: localStorage.getItem('player_token'),
          location_id: location.id,
          player_lat: myPos.lat,
          player_lng: myPos.lng,
          challenge_answer: answer || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { onError(`❌ ${data.error}`); return }
      onSuccess(`✅ ${location.name} geclaimd!`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute inset-0 z-[2000] flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[#1a1a2e] border-t border-white/10 rounded-t-2xl p-5 slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Location header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="text-4xl">{config.emoji}</div>
          <div className="flex-1">
            <h2 className="font-bold text-xl">{location.name}</h2>
            <p className="text-sm text-white/50">{config.label} · +{location.crown_value} kronen/tick</p>
            {location.description && <p className="text-sm text-white/70 mt-1">{location.description}</p>}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl">✕</button>
        </div>

        {/* Ability badge */}
        <div className="inline-flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 text-xs text-white/60 mb-4">
          <span>⚡</span> {config.description}
        </div>

        {/* Ownership status */}
        {isOwned && (
          <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: `${ownership!.player?.color}15`, border: `1px solid ${ownership!.player?.color}30` }}>
            {isMine ? (
              <p className="font-semibold text-emerald-400">✅ Dit is jouw locatie{ownership!.defense_level > 0 ? ` (verdediging lvl ${ownership!.defense_level})` : ''}</p>
            ) : (
              <p>
                <span style={{ color: ownership!.player?.color }}>●</span>
                {' '}<span className="font-semibold">{ownership!.player?.name}</span> bezit deze locatie
                {ownership!.defense_level > 0 && <span className="text-orange-400"> · 🛡️ lvl {ownership!.defense_level}</span>}
              </p>
            )}
          </div>
        )}

        {/* Distance */}
        <div className={`flex items-center gap-2 text-sm mb-4 ${inRange ? 'text-emerald-400' : 'text-orange-400'}`}>
          <span>{inRange ? '✅' : '📍'}</span>
          <span>{inRange ? 'Binnen bereik!' : `${distance}m weg (je moet binnen ${location.claim_radius}m zijn)`}</span>
        </div>

        {isMine ? (
          <div className="space-y-3">
            <button className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold">
              🛡️ Versterken (wordt binnenkort toegevoegd)
            </button>
            <button onClick={onClose} className="w-full py-3 text-white/40 text-sm">Sluiten</button>
          </div>
        ) : phase === 'info' ? (
          <button
            onClick={() => setPhase('challenge')}
            disabled={!inRange}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold transition-colors"
          >
            {inRange ? 'Uitdaging starten →' : 'Kom dichterbij'}
          </button>
        ) : (
          <div className="space-y-3">
            {location.challenge_type === 'checkin' && (
              <div className="p-4 bg-white/5 rounded-xl text-center">
                <p className="text-2xl mb-2">📍</p>
                <p className="font-semibold">Je bent hier! Bevestig je aanwezigheid.</p>
              </div>
            )}

            {(location.challenge_type === 'quiz' || location.challenge_type === 'puzzle') && (
              <div className="space-y-3">
                <div className="p-4 bg-white/5 rounded-xl">
                  <p className="font-semibold text-white/80">{challengeData.question ?? 'Beantwoord de vraag:'}</p>
                </div>
                <input
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder="Jouw antwoord..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            {location.challenge_type === 'photo' && (
              <div className="p-4 bg-white/5 rounded-xl">
                <p className="font-semibold mb-2">📸 Foto opdracht</p>
                <p className="text-white/70">{challengeData.photo_prompt ?? 'Maak een foto op deze locatie'}</p>
                <p className="text-xs text-white/30 mt-2">(De begeleider beoordeelt de foto later)</p>
              </div>
            )}

            {location.challenge_type === 'timed' && (
              <div className="p-4 bg-white/5 rounded-xl text-center">
                <p className="text-2xl mb-2">⏱️</p>
                <p className="font-semibold">Tijdsuitdaging — blijf 30 seconden op locatie</p>
              </div>
            )}

            <button
              onClick={submitClaim}
              disabled={loading || (location.challenge_type === 'quiz' && !answer)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl font-bold transition-colors"
            >
              {loading ? 'Bezig...' : '🏴 Claim deze locatie!'}
            </button>
            <button onClick={() => setPhase('info')} className="w-full py-2 text-white/30 text-sm">Terug</button>
          </div>
        )}
      </div>
    </div>
  )
}
