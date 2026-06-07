'use client'

import { useEffect, useRef } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'

interface OsmCandidate {
  id: number
  name: string
  lat: number
  lng: number
  type: LocationType
  challenge_type: string
  crown_value: number
  claim_radius: number
}

interface Props {
  locations: Location[]
  ownership: (LocationOwnership & { player: Player })[]
  players?: Player[]
  addingMode: boolean
  onMapClick: (lat: number, lng: number) => void
  pendingLocation: { lat: number; lng: number } | null
  onDeleteLocation: (id: string) => void
  liveMode?: boolean
  geofence?: { lat: number; lng: number; radius_meters: number } | null
  osmCandidates?: OsmCandidate[]
  onOsmCandidateClick?: (c: OsmCandidate) => void
  selectedOsmIds?: Set<number>
  drawingGeofence?: boolean
  onGeofenceSet?: (lat: number, lng: number) => void
}

export default function HostMap({
  locations, ownership, players, addingMode, onMapClick, pendingLocation, liveMode,
  geofence, osmCandidates, onOsmCandidateClick, selectedOsmIds, drawingGeofence, onGeofenceSet,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null)
  const markersRef = useRef<Map<string, unknown>>(new Map())
  const geofenceRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { center: [52.37, 4.9], zoom: 14, zoomControl: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB', subdomains: 'abcd', maxZoom: 20,
      }).addTo(map)
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (drawingGeofence) { onGeofenceSet?.(e.latlng.lat, e.latlng.lng); return }
        if (addingMode) onMapClick(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
    })

    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update cursor when mode changes
  useEffect(() => {
    if (!mapRef.current) return
    const cursor = drawingGeofence ? 'cell' : addingMode ? 'crosshair' : ''
    mapRef.current.getContainer().style.cursor = cursor
  }, [addingMode, drawingGeofence])

  // Redraw markers
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current!
      ;(markersRef.current as Map<string, { remove: () => void }>).forEach(m => m.remove())
      markersRef.current.clear()

      // Geofence circle
      if (geofenceRef.current) { (geofenceRef.current as { remove: () => void }).remove(); geofenceRef.current = null }
      if (geofence) {
        geofenceRef.current = L.circle([geofence.lat, geofence.lng], {
          radius: geofence.radius_meters,
          color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.05, weight: 2, dashArray: '6 4',
        }).addTo(map)
      }

      // Owned/unclaimed locations
      locations.forEach(loc => {
        const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
        const owner = ownership.find(o => o.location_id === loc.id)
        const color = owner?.player?.color ?? '#ffffff40'
        const icon = L.divIcon({
          html: `<div style="background:${color}22;border:2px solid ${color};border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px">${config.emoji}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], className: '',
        })
        const marker = L.marker([loc.lat, loc.lng], { icon })
          .bindPopup(`<b>${loc.name}</b><br>${config.label}${owner ? `<br>● ${owner.player?.name}` : ''}`)
          .addTo(map)
        markersRef.current.set(loc.id, marker)
      })

      // OSM candidates
      osmCandidates?.forEach(c => {
        const config = LOCATION_TYPE_CONFIG[c.type]
        const selected = selectedOsmIds?.has(c.id)
        const icon = L.divIcon({
          html: `<div style="background:${selected ? '#22c55e' : '#f59e0b'}33;border:2px dashed ${selected ? '#22c55e' : '#f59e0b'};border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:16px;opacity:${selected ? 1 : 0.7}">${config.emoji}</div>`,
          iconSize: [34, 34], iconAnchor: [17, 17], className: '',
        })
        const m = L.marker([c.lat, c.lng], { icon })
          .bindPopup(`<b>${c.name}</b><br>${config.label}<br><i>Klik om te selecteren</i>`)
          .addTo(map)
        m.on('click', () => onOsmCandidateClick?.(c))
        markersRef.current.set(`osm-${c.id}`, m)
      })

      // Pending new location
      if (pendingLocation) {
        const icon = L.divIcon({
          html: `<div style="background:#f59e0b;border:2px solid #f59e0b;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px">📍</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15], className: '',
        })
        markersRef.current.set('pending', L.marker([pendingLocation.lat, pendingLocation.lng], { icon }).addTo(map))
      }

      // Live player positions
      if (liveMode && players) {
        players.filter(p => p.lat && p.lng).forEach(player => {
          const icon = L.divIcon({
            html: `<div style="background:${player.color};border:3px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white">${player.name.charAt(0)}</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14], className: '',
          })
          L.marker([player.lat!, player.lng!], { icon })
            .bindPopup(`<b>${player.name}</b><br>${player.crowns} 👑`)
            .addTo(map)
        })
      }

      // Fit bounds
      if (locations.length > 0) {
        const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng]))
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] })
      }
    })
  }, [locations, ownership, players, pendingLocation, liveMode, geofence, osmCandidates, selectedOsmIds]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" />
}
