import { NextRequest } from 'next/server'
import { LocationType, ChallengeType, LOCATION_TYPE_CONFIG } from '@/lib/types'

interface OverpassElement {
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags: Record<string, string>
}

function classifyLocation(tags: Record<string, string>): { type: LocationType; name: string } {
  const name = tags.name ?? tags['name:nl'] ?? tags['name:en'] ?? null

  if (tags.historic || tags.tourism === 'attraction' || tags.tourism === 'museum') {
    return { type: 'tower', name: name ?? 'Historische plek' }
  }
  if (tags.amenity === 'marketplace' || tags.shop === 'marketplace') {
    return { type: 'market', name: name ?? 'Marktplaats' }
  }
  if (tags.amenity === 'pub' || tags.amenity === 'bar' || tags.amenity === 'restaurant') {
    return { type: 'mine', name: name ?? 'Horecapunt' }
  }
  if (tags.leisure === 'park' || tags.leisure === 'playground' || tags.natural === 'wood') {
    return { type: 'outpost', name: name ?? 'Park' }
  }
  if (tags.amenity === 'school' || tags.amenity === 'library' || tags.amenity === 'community_centre') {
    return { type: 'barracks', name: name ?? 'Gebouw' }
  }
  if (tags.highway === 'bus_stop' || tags.railway === 'station' || tags.railway === 'halt') {
    return { type: 'checkpoint', name: name ?? 'Halte' }
  }
  if (tags.amenity === 'place_of_worship' || tags.building === 'church' || tags.building === 'chapel') {
    return { type: 'tower', name: name ?? 'Kerk' }
  }
  if (tags.amenity === 'townhall' || tags.amenity === 'post_office' || tags.office) {
    return { type: 'barracks', name: name ?? 'Kantoor' }
  }

  return { type: 'checkpoint', name: name ?? 'Locatie' }
}

function defaultChallengeType(type: LocationType): ChallengeType {
  if (type === 'tower') return 'quiz'
  if (type === 'market') return 'checkin'
  if (type === 'barracks') return 'photo'
  if (type === 'mine') return 'timed'
  if (type === 'outpost') return 'checkin'
  return 'checkin'
}

export async function POST(request: NextRequest) {
  const { lat, lng, radius_meters = 1000 } = await request.json()

  const query = `
    [out:json][timeout:15];
    (
      node["name"]["amenity"~"pub|bar|restaurant|marketplace|school|library|community_centre|townhall|post_office|place_of_worship"](around:${radius_meters},${lat},${lng});
      node["name"]["tourism"~"attraction|museum|viewpoint"](around:${radius_meters},${lat},${lng});
      node["name"]["historic"](around:${radius_meters},${lat},${lng});
      node["name"]["leisure"~"park|playground"](around:${radius_meters},${lat},${lng});
      node["name"]["highway"="bus_stop"](around:${radius_meters},${lat},${lng});
      node["name"]["railway"~"station|halt"](around:${radius_meters},${lat},${lng});
      node["name"]["building"~"church|chapel"](around:${radius_meters},${lat},${lng});
    );
    out center 60;
  `

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' },
  })

  if (!res.ok) {
    return Response.json({ error: 'Overpass API fout' }, { status: 502 })
  }

  const data = await res.json()
  const elements: OverpassElement[] = data.elements ?? []

  const seen = new Set<string>()
  const locations = elements
    .filter(el => {
      const elLat = el.lat ?? el.center?.lat
      const elLng = el.lon ?? el.center?.lon
      return elLat && elLng
    })
    .map(el => {
      const elLat = el.lat ?? el.center!.lat
      const elLng = el.lon ?? el.center!.lon
      const { type, name } = classifyLocation(el.tags)
      const config = LOCATION_TYPE_CONFIG[type]
      return {
        id: el.id,
        name,
        lat: elLat,
        lng: elLng,
        type,
        challenge_type: defaultChallengeType(type),
        crown_value: config.crownValue,
        claim_radius: 50,
        description: el.tags.description ?? '',
      }
    })
    .filter(loc => {
      const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 30)

  return Response.json(locations)
}
