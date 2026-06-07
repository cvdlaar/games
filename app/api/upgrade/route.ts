import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UPGRADE_COST = [0, 50, 150, 300]

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { player_id, token, location_id } = await request.json()

  const { data: player } = await supabase.from('players').select('*').eq('id', player_id).single()
  if (!player || player.token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: ownership } = await supabase
    .from('location_ownership')
    .select('*')
    .eq('location_id', location_id)
    .eq('player_id', player_id)
    .single()

  if (!ownership) {
    return Response.json({ error: 'Je bezit deze locatie niet' }, { status: 403 })
  }

  const currentLevel = ownership.defense_level
  if (currentLevel >= 3) {
    return Response.json({ error: 'Al op maximaal niveau' }, { status: 400 })
  }

  const cost = UPGRADE_COST[currentLevel + 1]
  if (player.crowns < cost) {
    return Response.json({ error: `Niet genoeg kronen (${cost} nodig, jij hebt ${player.crowns})` }, { status: 400 })
  }

  await Promise.all([
    supabase.from('location_ownership').update({ defense_level: currentLevel + 1 }).eq('id', ownership.id),
    supabase.from('players').update({ crowns: player.crowns - cost }).eq('id', player_id),
  ])

  return Response.json({ defense_level: currentLevel + 1, cost, crowns_left: player.crowns - cost })
}
