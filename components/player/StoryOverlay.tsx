'use client'

import { useEffect, useState } from 'react'
import { NARRATOR_PRESETS, StoryChapter } from '@/lib/types'

interface Props {
  chapter: StoryChapter
  narratorId: string
  onDismiss: () => void
}

export default function StoryOverlay({ chapter, narratorId, onDismiss }: Props) {
  const narrator = NARRATOR_PRESETS.find(n => n.id === narratorId) ?? NARRATOR_PRESETS[0]
  const [displayedText, setDisplayedText] = useState('')
  const [done, setDone] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    setDisplayedText('')
    setDone(false)
    const text = chapter.content
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayedText(text.slice(0, i))
      if (i >= text.length) { clearInterval(timer); setDone(true) }
    }, 38)
    return () => clearInterval(timer)
  }, [chapter.id, chapter.content])

  function skipToEnd() {
    setDisplayedText(chapter.content)
    setDone(true)
  }

  const triggerLabel = chapter.trigger === 'game_start' ? 'Intro' : chapter.trigger === 'game_end' ? 'Outro' : 'Verhaal'
  const ctaLabel = chapter.trigger === 'game_start' ? 'Spel beginnen →' : chapter.trigger === 'game_end' ? 'Uitslag zien →' : 'Begrepen →'

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center pb-safe">
      <div
        className={`absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={done ? onDismiss : skipToEnd}
      />

      <div className={`relative w-full max-w-lg mx-3 mb-6 transition-all duration-400 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Chapter badge */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-bold text-white/35 uppercase tracking-widest">{triggerLabel}</span>
          {done && (
            <button onClick={onDismiss} className="text-xs text-white/35 hover:text-white/60 font-semibold transition-colors">
              Sluiten ✕
            </button>
          )}
        </div>

        {/* Card */}
        <div
          className="rounded-3xl overflow-hidden border border-white/[0.09] shadow-2xl shadow-black/60"
          style={{ background: 'linear-gradient(145deg, #0f0f22 0%, #090910 100%)' }}
        >
          {/* Narrator header */}
          <div
            className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06]"
            style={{ background: `linear-gradient(135deg, ${narrator.color}14 0%, transparent 80%)` }}
          >
            <div className="relative shrink-0">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${narrator.color}30, ${narrator.color}0d)`,
                  border: `1.5px solid ${narrator.color}38`,
                  boxShadow: `0 0 20px ${narrator.color}20`,
                }}
              >
                {narrator.emoji}
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#0f0f22]"
                style={{ background: narrator.color }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-white leading-tight">{narrator.name}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{narrator.tagline}</p>
            </div>
            <p className="text-xs font-semibold text-white/60 text-right max-w-[100px] truncate shrink-0">{chapter.title}</p>
          </div>

          {/* Story text */}
          <div className="px-5 py-4 min-h-[90px]">
            <p className="text-white/90 text-sm leading-relaxed">
              {displayedText}
              {!done && (
                <span className="inline-block w-0.5 h-[1.1em] bg-white/60 ml-0.5 animate-pulse align-[-0.1em]" />
              )}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-between">
            {!done ? (
              <button onClick={skipToEnd} className="text-xs text-white/30 hover:text-white/55 transition-colors font-medium">
                Overslaan →
              </button>
            ) : (
              <div />
            )}
            {done && (
              <button
                onClick={onDismiss}
                className="ml-auto px-5 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${narrator.color}dd, ${narrator.color}99)`,
                  boxShadow: `0 4px 20px ${narrator.color}35`,
                }}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
