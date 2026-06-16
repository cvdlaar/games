import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters, isInsideGeofence, scalePolygon } from '@/lib/game-logic'
import { GamePhase } from '@/lib/types'

export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const supabase = await createClient()
  const { gameId } = await params
  const { host_token } = await request.json()

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const config = game.config as Record<string, unknown>
  const phases = (config.phases ?? []) as GamePhase[]
  if (!phases.length) return Response.json({ error: 'Geen fases geconfigureerd' }, { status: 400 })

  const currentPhase = (game.current_phase ?? 0) as number
  const nextPhase = currentPhase + 1

  if (nextPhase >= phases.length) return Response.json({ error: 'Al in de laatste fase' }, { status: 400 })

  const phase = phases[nextPhase]
  const rawGeofence = config.geofence as import('@/lib/types').Geofence | null
  const baseRadius = (config.geofence_base_radius as number | null)

  // Shrink geofence (circle → radius * factor, polygon → scale toward centroid)
  let newGeofence: import('@/lib/types').Geofence | null = rawGeofence
  if (rawGeofence) {
    if (rawGeofence.type === 'polygon') {
      newGeofence = { type: 'polygon', points: scalePolygon(rawGeofence.points, phase.zone_factor) }
    } else {
      const base = baseRadius ?? rawGeofence.radius_meters
      newGeofence = { lat: rawGeofence.lat, lng: rawGeofence.lng, radius_meters: Math.round(base * phase.zone_factor) }
    }
  }

  // Neutralize locations outside the new zone
  let neutralizedCount = 0
  if (newGeofence) {
    const { data: locations } = await supabase.from('locations').select('id, lat, lng').eq('game_id', gameId)
    const outsideIds = (locations ?? [])
      .filter(l => !isInsideGeofence(l.lat, l.lng, newGeofence!))
      .map(l => l.id)

    if (outsideIds.length > 0) {
      await supabase.from('location_ownership').delete().in('location_id', outsideIds)
      neutralizedCount = outsideIds.length
    }
  }

  const newBaseRadius = rawGeofence?.type !== 'polygon' ? (baseRadius ?? (rawGeofence as { radius_meters?: number })?.radius_meters ?? null) : null

  // Update game
  await supabase.from('games').update({
    current_phase: nextPhase,
    config: {
      ...config,
      geofence: newGeofence,
      geofence_base_radius: newBaseRadius,
      phase_started_at: new Date().toISOString(),
    },
  }).eq('id', gameId)

  // Announce to players
  await supabase.from('game_events').insert({
    game_id: gameId,
    type: 'phase_change',
    player_id: null,
    data: {
      phase_index: nextPhase,
      phase_name: phase.name,
      zone_factor: phase.zone_factor,
      new_radius: newGeofence && 'radius_meters' in newGeofence ? newGeofence.radius_meters : null,
      neutralized: neutralizedCount,
      crown_penalty: phase.crown_penalty_per_tick,
    },
  })

  return Response.json({ phase_index: nextPhase, phase: phase, geofence: newGeofence, neutralized: neutralizedCount })
}
