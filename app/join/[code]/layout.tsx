import { Suspense } from 'react'

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border2)', borderTopColor: 'transparent' }} />
        <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--muted)' }}>VERBINDEN...</p>
      </div>
    }>
      {children}
    </Suspense>
  )
}
