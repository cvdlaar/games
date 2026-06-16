import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistanceMeters } from '@/lib/game-logic'

const REGION_RADIUS_METERS = 350
const REGION_NAMES = [
  'Noord', 'Zuid', 'Oost', 'West', 'Centrum', 'Haven', 'Park', 'Station',
  'Markt', 'Kasteelwijk', 'Bosrand', 'Rivier', 'Heuvel', 'Dal', 'Brug',
]

export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const supabase = await createClient()
  const { gameId } = await params
  const { host_token } = await request.json()

  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).single()
  if (!game || game.host_token !== host_token) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const { data: locations } = await supabase.from('locations').select('id, lat, lng').eq('game_id', gameId)
  if (!locations?.length) return Response.json({ error: 'Geen locaties' }, { status: 400 })

  // Simple greedy clustering
  const assigned: Record<string, { region_id: string; region_name: string }> = {}
  let regionIndex = 0

  for (const loc of locations) {
    if (assigned[loc.id]) continue
    const regionId = `r${regionIndex}`
    const regionName = REGION_NAMES[regionIndex % REGION_NAMES.length]
    assigned[loc.id] = { region_id: regionId, region_name: regionName }

    // Find all unassigned locations within radius
    for (const other of locations) {
      if (assigned[other.id]) continue
      if (getDistanceMeters(loc.lat, loc.lng, other.lat, other.lng) <= REGION_RADIUS_METERS) {
        assigned[other.id] = { region_id: regionId, region_name: regionName }
      }
    }
    regionIndex++
  }

  // Persist
  await Promise.all(
    Object.entries(assigned).map(([locId, { region_id, region_name }]) =>
      supabase.from('locations').update({ region_id, region_name }).eq('id', locId)
    )
  )

  const regionCount = new Set(Object.values(assigned).map(a => a.region_id)).size
  return Response.json({ regions: regionCount, assignments: assigned })
}
