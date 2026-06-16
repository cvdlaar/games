'use client'

import { useState } from 'react'

const SLIDES = [
  {
    emoji: '🗺️',
    title: 'Verover het territorium',
    text: 'Loop naar locaties op de kaart en claim ze door een uitdaging te voltooien. Hoe meer locaties jij bezit, hoe meer Kronen je verdient.',
  },
  {
    emoji: '👑',
    title: 'Kronen = punten',
    text: 'Elke locatie levert kronen op elke tick. Koop upgrades om je locaties beter te verdedigen. De speler met de meeste kronen aan het einde wint.',
  },
  {
    emoji: '🏰',
    title: 'Locatietypes',
    text: 'Torens geven intel over vijanden, kazernes beschermen buren, markten leveren de meeste kronen, mijnen zijn risicovol maar lucratief.',
  },
  {
    emoji: '⚔️',
    title: 'Encounters',
    text: 'Kom je een tegenstander tegen (binnen 50m)? Dan kun je aanvallen! Kies tussen Aanvallen, Verdedigen, Handelen of Ontwijken.',
  },
  {
    emoji: '⚡',
    title: 'Powerups',
    text: 'Zoek QR-codes in het speelgebied om powerups te vrijspelen: extra kronen, schilden, radar, geheime locaties en meer!',
  },
  {
    emoji: '🔵',
    title: 'Blijf binnen het speelveld',
    text: 'Je begeleider heeft een geofence ingesteld. Ga je buiten het gebied? Dan zie je een rode waarschuwing. Locaties claimen kan alleen van binnen het gebied.',
  },
]

interface Props {
  onClose: () => void
}

export default function OnboardingModal({ onClose }: Props) {
  const [slide, setSlide] = useState(0)
  const last = slide === SLIDES.length - 1
  const s = SLIDES[slide]

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center pt-5">
          {SLIDES.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === slide ? 24 : 6, background: i === slide ? '#2563eb' : 'var(--border2)' }} />
          ))}
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="text-6xl mb-5">{s.emoji}</div>
          <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text)' }}>{s.title}</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{s.text}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 p-5 pt-0">
          {slide > 0 && (
            <button onClick={() => setSlide(s => s - 1)}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors"
              style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--muted)' }}>
              ← Terug
            </button>
          )}
          <button
            onClick={() => last ? onClose() : setSlide(s => s + 1)}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-all text-white"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
          >
            {last ? 'Spelen! 🚀' : 'Volgende →'}
          </button>
        </div>
        <button onClick={onClose} className="w-full pb-5 text-xs transition-colors" style={{ color: 'var(--dim)' }}>Overslaan</button>
      </div>
    </div>
  )
}
