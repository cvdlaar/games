'use client'

import { useEffect, useState } from 'react'
import { NARRATOR_PRESETS, StoryChapter } from '@/lib/types'

interface RankedPlayer {
  id: string
  name: string
  color: string
  avatar?: string
  crowns: number
  rank: number
}

interface ApprovedPhoto {
  id: string
  player_name: string
  player_color: string
  player_avatar: string
  location_name: string
  photo_prompt: string
  answer: string
}

interface Props {
  gameName: string
  players: RankedPlayer[]
  myPlayerId: string
  outroChapter?: StoryChapter | null
  narratorId?: string
  photos?: ApprovedPhoto[]
  onShare?: () => void
}

export default function EndingScreen({ gameName, players, myPlayerId, outroChapter, narratorId, photos = [], onShare }: Props) {
  const sorted = [...players].sort((a, b) => b.crowns - a.crowns)
  const narrator = NARRATOR_PRESETS.find(n => n.id === (narratorId ?? '')) ?? NARRATOR_PRESETS[0]

  // Assign ranks accounting for ties
  const ranks: number[] = sorted.map((p, i) => {
    if (i === 0) return 1
    return sorted[i - 1].crowns === p.crowns ? ranks[i - 1] : i + 1
  })
  const myIdx = sorted.findIndex(p => p.id === myPlayerId)
  const myRank = myIdx >= 0 ? ranks[myIdx] : 0
  const tiedWithFirst = sorted.filter(p => p.crowns === sorted[0]?.crowns).length > 1
  const iAmFirst = myRank === 1
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  const top3 = sorted.slice(0, 3)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)
  const podiumHeights = [72, 100, 52]
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className={`flex-1 overflow-y-auto transition-all duration-700 relative ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="flex flex-col items-center px-4 pt-8 pb-8 min-h-full">

          {/* Gradient header — narrator themed */}
          <div className="w-full max-w-xs mb-8 text-center px-6 pt-8 pb-6 rounded-3xl"
            style={{ background: `linear-gradient(135deg, ${narrator.color} 0%, ${narrator.color}99 100%)`, boxShadow: `0 8px 32px ${narrator.color}40` }}>
            <div className="text-4xl mb-2">{tiedWithFirst ? '🤝' : '🏆'}</div>
            <h1 className="font-black text-2xl text-white mb-1">{gameName}</h1>
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {tiedWithFirst ? 'Gelijkspel — gedeeld kampioenschap' : 'Eindstand'}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <span className="text-base">{narrator.emoji}</span>
              <span className="text-xs font-bold text-white/70">{narrator.name}</span>
            </div>
          </div>

          {/* Podium */}
          {top3.length > 0 && (
            <div className="flex items-end justify-center gap-4 mb-8 w-full max-w-xs">
              {podiumOrder.map((player, colIdx) => {
                const rankIdx = top3.indexOf(player)
                const height = podiumHeights[colIdx]
                const isWinner = rankIdx === 0
                const podiumBg = rankIdx === 0
                  ? 'linear-gradient(135deg,#f59e0b,#ef4444)'
                  : rankIdx === 1 ? 'linear-gradient(135deg,#94a3b8,#cbd5e1)' : 'linear-gradient(135deg,#b45309,#d97706)'
                return (
                  <div key={player.id} className="flex flex-col items-center"
                    style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(12px)', transition: `all 0.6s ${colIdx * 0.12 + 0.2}s` }}>
                    {isWinner && <div className="text-xl mb-1 animate-bounce">👑</div>}
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-1 border-2"
                      style={{ background: player.color + '20', borderColor: player.color }}>
                      {player.avatar ?? player.name.charAt(0)}
                    </div>
                    <p className="text-xs font-bold max-w-14 truncate text-center" style={{ color: 'var(--text)' }}>{player.name}</p>
                    <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--amber)' }}>{player.crowns}👑</p>
                    <div className="w-16 flex flex-col items-center justify-end rounded-t-2xl" style={{ height: `${height}px`, background: podiumBg, boxShadow: isWinner ? '0 4px 16px rgba(245,158,11,0.4)' : undefined }}>
                      <span className="text-2xl mb-2">{medals[rankIdx]}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* My result badge */}
          {myRank > 0 && (
            <div className="mb-5 w-full max-w-xs px-4 py-3 rounded-2xl text-center font-bold text-sm"
              style={{
                background: iAmFirst && tiedWithFirst ? `linear-gradient(135deg, ${narrator.color}20, ${narrator.color}10)` : myRank <= 3 ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : 'var(--surface)',
                border: `1.5px solid ${iAmFirst && tiedWithFirst ? narrator.color + '60' : myRank <= 3 ? '#fde68a' : 'var(--border2)'}`,
                color: iAmFirst && tiedWithFirst ? narrator.color : myRank <= 3 ? '#d97706' : 'var(--accent)',
              }}>
              {iAmFirst && tiedWithFirst
                ? `🤝 Gelijkspel — jij deelt de 1e plek!`
                : myRank === 1 ? `🥇 Jij bent kampioen!`
                : myRank <= 3 ? `${medals[myRank - 1]} Jij op plek ${myRank} — Podium!`
                : `Jij eindigde op plek #${myRank}`}
            </div>
          )}

          {/* Narrator outro */}
          {outroChapter && (
            <div className="w-full max-w-xs mb-5 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)' }}>
              <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${narrator.color}18`, border: `1.5px solid ${narrator.color}40` }}>
                  {narrator.emoji}
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{narrator.name}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{outroChapter.title}</p>
                </div>
              </div>
              <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{outroChapter.content}</p>
            </div>
          )}

          {/* Full ranking list */}
          <div className="w-full max-w-xs space-y-1.5 mb-6">
            <p className="text-xs font-bold mb-3" style={{ color: 'var(--muted)' }}>Alle deelnemers</p>
            {sorted.map((p, i) => {
              const isMe = p.id === myPlayerId
              const rank = ranks[i]
              const isTied = sorted.filter(x => x.crowns === p.crowns).length > 1
              const isFirst = rank === 1
              const rankLabel = isTied ? `${medals[rank - 1] ?? rank}=` : (medals[rank - 1] ?? `${rank}`)
              return (
                <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{
                    background: isFirst ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : isMe ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'var(--surface)',
                    border: `1.5px solid ${isFirst ? '#fde68a' : isMe ? '#bfdbfe' : 'var(--border)'}`,
                  }}>
                  <span className="text-base w-7 text-center shrink-0 font-bold" style={{ color: isTied && isFirst ? narrator.color : 'var(--text)' }}>{rankLabel}</span>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: p.color + '20', border: `2px solid ${p.color}` }}>
                    {p.avatar ?? p.name.charAt(0)}
                  </div>
                  <span className="flex-1 font-bold text-sm truncate" style={{ color: 'var(--text)' }}>
                    {p.name}{isMe && <span className="ml-1 text-xs font-normal" style={{ color: 'var(--muted)' }}>(jij)</span>}
                    {isTied && <span className="ml-1 text-[10px] font-bold px-1 rounded" style={{ background: narrator.color + '20', color: narrator.color }}>gelijk</span>}
                  </span>
                  <span className="font-black text-sm shrink-0 px-2 py-0.5 rounded-lg"
                    style={{ background: isFirst ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--surface2)', color: isFirst ? '#fff' : 'var(--amber)' }}>
                    {p.crowns}👑
                  </span>
                </div>
              )
            })}
          </div>

          {/* Photo gallery */}
          {photos.length > 0 && (
            <div className="w-full max-w-xs mb-6">
              <p className="text-xs font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>📸 Ingezonden foto's ({photos.length})</p>
              <div className="space-y-2">
                {photos.map(photo => (
                  <div key={photo.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: photo.player_color + '20', border: `1.5px solid ${photo.player_color}` }}>
                        {photo.player_avatar}
                      </div>
                      <span className="font-bold text-xs flex-1" style={{ color: 'var(--text)' }}>{photo.player_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-lg font-bold" style={{ background: '#eff6ff', color: '#2563eb' }}>
                        📍 {photo.location_name}
                      </span>
                    </div>
                    {photo.photo_prompt && (
                      <p className="px-3 pt-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="font-bold">Opdracht: </span>{photo.photo_prompt}
                      </p>
                    )}
                    {photo.answer && (
                      <p className="px-3 py-2.5 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{photo.answer}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {onShare && (
            <button onClick={onShare}
              className="w-full max-w-xs py-4 font-black text-base rounded-xl transition-all text-white"
              style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
              Uitslag delen →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
