'use client'

interface Player { id: string; name: string; color: string; avatar?: string }
interface Tick { timestamp: string; scores: Record<string, number> }

interface Props {
  players: Player[]
  ticks: Tick[]
}

export default function CrownChart({ players, ticks }: Props) {
  if (ticks.length < 2) {
    return (
      <div className="flex items-center justify-center py-12 rounded-2xl" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--dim)' }}>Nog niet genoeg data — speel minimaal 2 ticks</p>
      </div>
    )
  }

  const W = 600
  const H = 260
  const PL = 44   // padding left
  const PR = 16
  const PT = 16
  const PB = 32

  const chartW = W - PL - PR
  const chartH = H - PT - PB

  // Find y-range
  const allScores = ticks.flatMap(t => Object.values(t.scores))
  const maxY = Math.max(...allScores, 10)
  const tickCount = ticks.length

  function xPos(i: number) { return PL + (i / (tickCount - 1)) * chartW }
  function yPos(v: number) { return PT + chartH - (v / maxY) * chartH }

  // Y axis labels
  const ySteps = 4
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round((maxY / ySteps) * i))

  // X axis: show at most 6 time labels
  const xLabelIdxs = ticks.length <= 6
    ? ticks.map((_, i) => i)
    : [0, ...Array.from({ length: 4 }, (_, i) => Math.round((i + 1) * (ticks.length - 1) / 5)), ticks.length - 1]

  function fmtTime(ts: string) {
    const d = new Date(ts)
    return d.toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <p className="font-black text-sm" style={{ color: 'var(--text)' }}>📈 Kronenverloop</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {players.slice(0, 8).map(p => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="text-xs font-medium truncate max-w-16" style={{ color: 'var(--muted)' }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        {/* Grid lines */}
        {yLabels.map(v => {
          const y = yPos(v)
          return (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--dim)">{v}</text>
            </g>
          )
        })}

        {/* X axis labels */}
        {xLabelIdxs.map(i => (
          <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--dim)">
            {fmtTime(ticks[i].timestamp)}
          </text>
        ))}

        {/* Lines per player */}
        {players.map(p => {
          const points = ticks
            .map((t, i) => {
              const v = t.scores[p.id] ?? 0
              return `${xPos(i)},${yPos(v)}`
            })
            .join(' ')
          return (
            <g key={p.id}>
              <polyline
                points={points}
                fill="none"
                stroke={p.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
              />
              {/* Last point dot */}
              {(() => {
                const last = ticks[ticks.length - 1]
                const v = last.scores[p.id] ?? 0
                return <circle cx={xPos(ticks.length - 1)} cy={yPos(v)} r="4" fill={p.color} stroke="#fff" strokeWidth="1.5" />
              })()}
            </g>
          )
        })}

        {/* Y axis line */}
        <line x1={PL} x2={PL} y1={PT} y2={H - PB} stroke="var(--border2)" strokeWidth="1" />
      </svg>
    </div>
  )
}
