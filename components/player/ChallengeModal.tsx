'use client'

import { useState, useEffect } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'
import { getDistanceMeters } from '@/lib/game-logic'
import { createClient } from '@/lib/supabase/client'

const UPGRADE_COSTS = [0, 50, 150, 300]

interface Props {
  location: Location
  ownership: (LocationOwnership & { player: Player }) | null
  myPlayer: Player
  myPos: { lat: number; lng: number }
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  onRefresh?: () => void
}

export default function ChallengeModal({ location, ownership, myPlayer, myPos, onClose, onSuccess, onError, onRefresh }: Props) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'info' | 'challenge'>('info')
  const [upgrading, setUpgrading] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const TIMED_SECONDS = (location.challenge_data as { time_limit_seconds?: number }).time_limit_seconds ?? 30

  useEffect(() => {
    if (phase !== 'challenge' || location.challenge_type !== 'timed') return
    setTimerSeconds(TIMED_SECONDS)
    const id = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev === null || prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const config = LOCATION_TYPE_CONFIG[location.type as LocationType]
  const distance = Math.round(getDistanceMeters(myPos.lat, myPos.lng, location.lat, location.lng))
  const inRange = distance <= location.claim_radius
  const isMine = ownership?.player_id === myPlayer.id
  const challengeData = location.challenge_data as { question?: string; photo_prompt?: string }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function submitClaim() {
    setLoading(true)
    let finalAnswer = answer || null

    if (location.challenge_type === 'photo' && photoFile) {
      setUploadingPhoto(true)
      try {
        const supabase = createClient()
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `${myPlayer.id}_${Date.now()}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage.from('photos').upload(path, photoFile, { upsert: true })
        if (uploadError) { onError('Foto uploaden mislukt: ' + uploadError.message); setLoading(false); setUploadingPhoto(false); return }
        const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(uploadData.path)
        finalAnswer = publicUrl
      } finally {
        setUploadingPhoto(false)
      }
    }

    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
    try {
      const res = await Promise.race([
        fetch('/api/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_id: myPlayer.id,
            token: localStorage.getItem('player_token'),
            location_id: location.id,
            player_lat: myPos.lat,
            player_lng: myPos.lng,
            challenge_answer: finalAnswer,
          }),
        }),
        timeout,
      ])
      const data = await res.json()
      if (!res.ok) { onError(data.error); return }
      if (data.pending) { onSuccess(data.message ?? 'Ingediend — wacht op goedkeuring'); return }
      onSuccess(`${location.name} veroverd${data.bonus_crowns ? ` · +${data.bonus_crowns}👑 bonus` : ''}`)
    } catch (err) {
      if ((err as Error).message === 'timeout') {
        onError('Server reageert niet — probeer opnieuw')
      } else {
        onError('Verbinding mislukt')
      }
    } finally {
      setLoading(false)
    }
  }

  async function upgradeDefense() {
    setUpgrading(true)
    try {
      const res = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayer.id, token: localStorage.getItem('player_token'), location_id: location.id }),
      })
      const data = await res.json()
      if (!res.ok) { onError(data.error); return }
      onSuccess(`Verdediging niveau ${data.defense_level} geactiveerd`)
      onRefresh?.()
    } finally {
      setUpgrading(false)
    }
  }

  const defLevel = ownership?.defense_level ?? 0
  const nextUpgradeCost = defLevel < 3 ? UPGRADE_COSTS[defLevel + 1] : null
  const canUpgrade = nextUpgradeCost !== null && myPlayer.crowns >= nextUpgradeCost

  return (
    <div className="absolute inset-0 z-[2000] flex items-end" onClick={onClose}>
      <div className="w-full slide-up max-h-[85vh] overflow-y-auto rounded-t-xl" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderBottom: 'none', boxShadow: '0 -4px 40px rgba(0,0,0,0.6)' }}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border2)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 pt-1 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-3xl">{config.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black tracking-widest mb-0.5" style={{ color: 'var(--muted)' }}>{config.label}</div>
            <h2 className="font-black text-xl leading-tight truncate" style={{ color: 'var(--text)' }}>{location.name}</h2>
            <p className="mono text-xs mt-0.5" style={{ color: 'var(--muted)' }}>+{location.crown_value}◈/t · bereik {location.claim_radius}m</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center mono text-sm shrink-0 mt-0.5 transition-colors"
            style={{ background: 'var(--surface3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Description */}
          {location.description && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{location.description}</p>
          )}

          {/* Spec row */}
          <div className="mono text-xs tracking-widest px-3 py-2.5 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            {config.description}
          </div>

          {/* Ownership */}
          {ownership && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: `${ownership.player?.color}12`, border: `1px solid ${ownership.player?.color}35` }}>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ownership.player?.color }} />
              {isMine
                ? <span className="font-bold" style={{ color: 'var(--accent)' }}>JOUW POST {defLevel > 0 && <span className="mono text-xs ml-1" style={{ color: 'var(--muted)' }}>VRD {defLevel}</span>}</span>
                : <><span className="font-bold" style={{ color: ownership.player?.color }}>{ownership.player?.name}</span><span className="mono text-xs ml-1" style={{ color: 'var(--muted)' }}>{defLevel > 0 ? `VRD ${defLevel}` : ''}</span></>
              }
            </div>
          )}

          {/* Distance */}
          <div className="flex items-center gap-2.5 text-sm font-bold px-3 py-2.5 rounded-xl"
            style={{ background: inRange ? '#f0fdf4' : '#fef2f2', border: `1.5px solid ${inRange ? '#86efac' : '#fca5a5'}`, color: inRange ? 'var(--accent)' : 'var(--red)' }}>
            <span className="text-base">{inRange ? '◉' : '⚠'}</span>
            {inRange ? 'BINNEN BEREIK' : `${distance}m — kom binnen ${location.claim_radius}m van het gebied`}
          </div>

          {/* Actions */}
          {isMine ? (
            <div className="space-y-2">
              {defLevel < 3 ? (
                <button onClick={upgradeDefense} disabled={upgrading || !canUpgrade}
                  className="w-full py-3.5 font-black text-sm tracking-widest uppercase transition-all rounded-lg disabled:opacity-30"
                  style={{ background: canUpgrade ? '#fffbeb' : 'var(--surface2)', border: `1.5px solid ${canUpgrade ? '#fde68a' : 'var(--border)'}`, color: canUpgrade ? 'var(--amber)' : 'var(--dim)', boxShadow: canUpgrade ? '0 2px 8px rgba(217,119,6,0.15)' : undefined }}>
                  {upgrading ? 'VERSTERKEN...' : `🛡 VRD → LVL ${defLevel + 1}  (${nextUpgradeCost}◈)`}
                </button>
              ) : (
                <div className="py-2.5 mono text-xs tracking-widest text-center rounded-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  MAX VERDEDIGING — LVL 3
                </div>
              )}
              <button onClick={onClose} className="w-full py-2 mono text-xs tracking-widest uppercase" style={{ color: 'var(--dim)' }}>SLUITEN</button>
            </div>

          ) : phase === 'info' ? (
            <button onClick={() => setPhase('challenge')} disabled={!inRange}
              className="w-full py-4 font-black text-sm tracking-widest uppercase transition-all rounded-lg disabled:opacity-30"
              style={{ background: inRange ? 'var(--accent2)' : 'var(--surface2)', color: inRange ? '#fff' : 'var(--dim)', border: inRange ? 'none' : '1px solid var(--border)', boxShadow: inRange ? '0 4px 14px rgba(34,197,94,0.3)' : undefined }}>
              {inRange ? '▶ UITDAGING STARTEN' : 'NIET IN BEREIK'}
            </button>

          ) : (
            <div className="space-y-3">
              {/* Mission briefing banner */}
              <div className="px-3 py-2.5 rounded-lg flex items-center gap-2.5"
                style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-1.5 h-1.5 rounded-full blink shrink-0" style={{ background: '#ef4444' }} />
                <p className="mono text-[11px] tracking-widest font-black" style={{ color: '#94a3b8' }}>MISSIE ACTIEF — {config.label.toUpperCase()}</p>
              </div>

              {location.challenge_type === 'checkin' && (
                <div className="px-3 py-4 rounded-lg text-center"
                  style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="mono text-xs tracking-widest mb-1.5 font-black" style={{ color: '#64748b' }}>CHECK-IN VEREIST</p>
                  <p className="font-bold text-sm" style={{ color: '#e2e8f0' }}>Bevestig je aanwezigheid op deze post.</p>
                </div>
              )}

              {(location.challenge_type === 'quiz' || location.challenge_type === 'puzzle') && (
                <div className="space-y-2">
                  <div className="px-3 py-3.5 rounded-lg"
                    style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className="mono text-[10px] tracking-widest mb-2 font-black" style={{ color: '#64748b' }}>MISSIEVRAAG</p>
                    <p className="font-bold text-sm leading-snug" style={{ color: '#e2e8f0' }}>{challengeData.question ?? 'Beantwoord de vraag:'}</p>
                  </div>
                  <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="ANTWOORD..."
                    className="w-full px-3 py-3 mono text-sm uppercase tracking-wide outline-none rounded-lg"
                    style={{ background: '#0f172a', border: '1.5px solid rgba(34,197,94,0.4)', color: '#4ade80', caretColor: '#4ade80' }} />
                </div>
              )}

              {location.challenge_type === 'photo' && (
                <div className="space-y-2">
                  <div className="px-3 py-3.5 rounded-lg"
                    style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className="mono text-[10px] tracking-widest mb-2 font-black" style={{ color: '#64748b' }}>FOTO OPDRACHT</p>
                    <p className="text-sm leading-snug" style={{ color: '#e2e8f0' }}>{challengeData.photo_prompt ?? 'Maak een foto op deze locatie'}</p>
                  </div>
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="preview" className="w-full rounded-lg object-cover" style={{ maxHeight: '200px' }} />
                      <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'rgba(0,0,0,0.7)' }}>✕</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full py-8 rounded-lg cursor-pointer gap-2"
                      style={{ background: '#0f172a', border: '2px dashed rgba(255,255,255,0.15)', color: '#64748b' }}>
                      <span className="text-3xl">📷</span>
                      <span className="mono text-xs tracking-widest">MAAK OF KIES EEN FOTO</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                    </label>
                  )}
                  <p className="mono text-[11px] tracking-widest" style={{ color: 'var(--dim)' }}>HOST BEOORDEELT INZENDING</p>
                </div>
              )}

              {location.challenge_type === 'timed' && (
                <div className="px-3 py-5 rounded-lg text-center"
                  style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="mono text-[10px] tracking-widest mb-3 font-black" style={{ color: '#64748b' }}>BLIJF OP POSITIE</p>
                  {timerSeconds !== null && timerSeconds > 0 && (
                    <>
                      <p className="mono font-black text-6xl tabular-nums" style={{ color: timerSeconds <= 10 ? '#ef4444' : '#f59e0b' }}>{String(timerSeconds).padStart(2, '0')}</p>
                      <p className="mono text-xs mt-1 tracking-widest" style={{ color: '#475569' }}>SECONDEN</p>
                      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full transition-all duration-1000 rounded-full" style={{ width: `${(timerSeconds / TIMED_SECONDS) * 100}%`, background: timerSeconds <= 10 ? 'linear-gradient(90deg,#ef4444,#f97316)' : 'linear-gradient(90deg,#f59e0b,#22c55e)' }} />
                      </div>
                    </>
                  )}
                  {timerSeconds === 0 && <p className="font-black text-base" style={{ color: '#4ade80' }}>◉ KLAAR — CLAIM NU</p>}
                </div>
              )}

              <button onClick={submitClaim}
                disabled={loading || (location.challenge_type === 'quiz' && !answer) || (location.challenge_type === 'timed' && (timerSeconds === null || timerSeconds > 0)) || (location.challenge_type === 'photo' && !photoFile)}
                className="w-full py-4 font-black text-sm tracking-widest uppercase transition-all rounded-xl disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', boxShadow: '0 4px 18px rgba(22,163,74,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {loading ? (uploadingPhoto ? '📤 FOTO UPLOADEN...' : '⏳ BEZIG...') : '🏴 INNEMEN'}
              </button>
              <button onClick={() => setPhase('info')} className="w-full py-2 mono text-xs tracking-widest uppercase" style={{ color: 'var(--dim)' }}>TERUG</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
