'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { POWERUP_CONFIG, PowerupType } from '@/lib/types'

type ScanState = 'loading' | 'success' | 'already_claimed' | 'error' | 'no_player'

export default function ScanPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<ScanState>('loading')
  const [result, setResult] = useState<{ label: string; emoji: string; type: string; message: string } | null>(null)

  useEffect(() => {
    const playerId = localStorage.getItem('player_id')
    const playerToken = localStorage.getItem('player_token')

    if (!playerId || !playerToken) {
      setState('no_player')
      return
    }

    async function claim() {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, player_id: playerId, player_token: playerToken }),
      })
      const data = await res.json()
      if (res.status === 409) { setState('already_claimed'); setResult(data); return }
      if (!res.ok) { setState('error'); setResult({ label: 'Fout', emoji: '❌', type: '', message: data.error }); return }
      setState('success')
      setResult(data)
    }
    claim()
  }, [token])

  const config = result?.type ? POWERUP_CONFIG[result.type as PowerupType] : null

  return (
    <div className="h-full flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {state === 'loading' && (
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">⚡</div>
          <p style={{ color: 'var(--muted)' }}>Powerup scannen...</p>
        </div>
      )}

      {state === 'success' && result && (
        <div className="text-center slide-up">
          <div className="text-7xl mb-6">{result.emoji}</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>{result.label}</h1>
          <p className="mb-2" style={{ color: 'var(--muted)' }}>{config?.description}</p>
          <p className="font-semibold mb-8" style={{ color: '#16a34a' }}>{result.message}</p>
          <button onClick={() => router.back()}
            className="px-6 py-3 rounded-xl font-bold transition-colors text-white"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
            Terug naar spel →
          </button>
        </div>
      )}

      {state === 'already_claimed' && (
        <div className="text-center">
          <div className="text-6xl mb-4">😤</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Al geclaimd</h1>
          <p className="mb-6" style={{ color: 'var(--muted)' }}>Deze powerup is al door iemand anders gevonden.</p>
          <button onClick={() => router.back()}
            className="px-6 py-3 rounded-xl font-bold transition-colors"
            style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
            Terug
          </button>
        </div>
      )}

      {state === 'no_player' && (
        <div className="text-center">
          <div className="text-6xl mb-4">🤔</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Niet ingelogd</h1>
          <p className="mb-6" style={{ color: 'var(--muted)' }}>Je moet eerst inloggen in het spel.</p>
          <button onClick={() => router.push('/')}
            className="px-6 py-3 rounded-xl font-bold transition-colors text-white"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
            Naar spel
          </button>
        </div>
      )}

      {state === 'error' && result && (
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Fout</h1>
          <p className="mb-6" style={{ color: 'var(--muted)' }}>{result.message}</p>
          <button onClick={() => router.back()}
            className="px-6 py-3 rounded-xl font-bold transition-colors"
            style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)' }}>
            Terug
          </button>
        </div>
      )}
    </div>
  )
}
