'use client'

import { useEffect, useRef } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType, Geofence } from '@/lib/types'

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

interface RegionInfo {
  id: string
  name: string
  color: string
}

interface Props {
  locations: Location[]
  ownership: (LocationOwnership & { player: Player })[]
  players?: Player[]
  regions?: RegionInfo[]
  addingMode: boolean
  onMapClick: (lat: number, lng: number) => void
  pendingLocation: { lat: number; lng: number } | null
  onDeleteLocation: (id: string) => void
  liveMode?: boolean
  geofence?: Geofence | null
  pendingPolygon?: Array<{ lat: number; lng: number }>
  osmCandidates?: OsmCandidate[]
  onOsmCandidateClick?: (c: OsmCandidate) => void
  selectedOsmIds?: Set<number>
  osmSearchCircle?: { lat: number; lng: number; radius: number } | null
  drawingGeofence?: boolean
  onGeofenceSet?: (lat: number, lng: number) => void
  onMapReady?: (map: unknown) => void
  initialCenter?: [number, number]
  homebaseMode?: boolean
  onHomebaseSet?: (lat: number, lng: number) => void
  homeBase?: { lat: number; lng: number } | null
  draggableLocations?: boolean
  onLocationMove?: (id: string, lat: number, lng: number) => void
  templateLocations?: Array<{ tempId: string; lat: number; lng: number; name: string; type: LocationType }>
  onTemplateDrag?: (tempId: string, lat: number, lng: number) => void
}

export default function HostMap({
  locations, ownership, players, regions, addingMode, onMapClick, pendingLocation, liveMode,
  geofence, pendingPolygon, osmCandidates, onOsmCandidateClick, selectedOsmIds, osmSearchCircle,
  drawingGeofence, onGeofenceSet, onMapReady,
  initialCenter, homebaseMode, onHomebaseSet, homeBase,
  draggableLocations, onLocationMove, templateLocations, onTemplateDrag,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null)
  const markersRef = useRef<Map<string, unknown>>(new Map())
  const geofenceRef = useRef<unknown>(null)
  const pendingLayersRef = useRef<Array<{ remove: () => void }>>([])
  const osmCircleRef = useRef<{ remove: () => void } | null>(null)
  const hasAutoFitRef = useRef(false)

  // Keep fresh refs for the click handler (avoids stale closure)
  const addingRef = useRef(addingMode)
  const drawingRef = useRef(drawingGeofence)
  const homebaseModeRef = useRef(homebaseMode)
  const onMapClickRef = useRef(onMapClick)
  const onGeofenceSetRef = useRef(onGeofenceSet)
  const onHomebaseSetRef = useRef(onHomebaseSet)
  const onMapReadyRef = useRef(onMapReady)
  const onLocationMoveRef = useRef(onLocationMove)
  const onTemplateDragRef = useRef(onTemplateDrag)
  onLocationMoveRef.current = onLocationMove
  onTemplateDragRef.current = onTemplateDrag
  addingRef.current = addingMode
  drawingRef.current = drawingGeofence
  homebaseModeRef.current = homebaseMode
  onMapClickRef.current = onMapClick
  onGeofenceSetRef.current = onGeofenceSet
  onHomebaseSetRef.current = onHomebaseSet
  onMapReadyRef.current = onMapReady

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current) return
      // Guard against double-init from React Strict Mode / HMR
      const el = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
      if (el._leaflet_id) return
      const map = L.map(containerRef.current, { center: initialCenter ?? [52.37, 4.9], zoom: initialCenter ? 15 : 13, zoomControl: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd', maxZoom: 20,
      }).addTo(map)

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (homebaseModeRef.current) { onHomebaseSetRef.current?.(e.latlng.lat, e.latlng.lng); return }
        if (drawingRef.current) { onGeofenceSetRef.current?.(e.latlng.lat, e.latlng.lng); return }
        if (addingRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
      if (!cancelled) onMapReadyRef.current?.(map)
    })

    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update cursor when mode changes
  useEffect(() => {
    if (!mapRef.current) return
    const cursor = homebaseMode ? 'cell' : drawingGeofence ? 'cell' : addingMode ? 'crosshair' : ''
    mapRef.current.getContainer().style.cursor = cursor
  }, [addingMode, drawingGeofence, homebaseMode])

  // Update geofence shape independently (circle or polygon, no full marker redraw)
  useEffect(() => {
    import('leaflet').then(L => {
      if (!mapRef.current) return
      const map = mapRef.current

      // Remove previous geofence shape
      if (geofenceRef.current) { (geofenceRef.current as { remove: () => void }).remove(); geofenceRef.current = null }

      // Remove previous pending polygon layers (prevents stacking on each new point)
      pendingLayersRef.current.forEach(l => l.remove())
      pendingLayersRef.current = []

      if (!mapRef.current) return

      const style = { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.08, weight: 2, dashArray: '8 5' }
      if (geofence) {
        if (geofence.type === 'polygon' && geofence.points.length >= 3) {
          geofenceRef.current = L.polygon(geofence.points.map(p => [p.lat, p.lng] as [number, number]), style).addTo(map)
        } else if (geofence.type !== 'polygon') {
          geofenceRef.current = L.circle([geofence.lat, geofence.lng], { ...style, radius: geofence.radius_meters }).addTo(map)
        }
      }
      // Pending polygon (in-progress drawing) — track all layers for cleanup
      if (pendingPolygon && pendingPolygon.length >= 1) {
        if (pendingPolygon.length >= 2) {
          const latlngs = pendingPolygon.map(p => [p.lat, p.lng] as [number, number])
          const shape = pendingPolygon.length >= 3
            ? L.polygon(latlngs, { ...style, fillOpacity: 0.04, dashArray: '5 5' })
            : L.polyline(latlngs, { color: '#16a34a', weight: 2, dashArray: '5 5' })
          shape.addTo(map)
          pendingLayersRef.current.push(shape)
        }
        pendingPolygon.forEach((p, i) => {
          const icon = L.divIcon({
            html: `<div style="width:12px;height:12px;border-radius:50%;background:${i === 0 ? '#f59e0b' : '#fff'};border:2px solid ${i === 0 ? '#d97706' : '#f59e0b'};box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>`,
            iconSize: [10, 10], iconAnchor: [5, 5], className: '',
          })
          const m = L.marker([p.lat, p.lng], { icon }).addTo(map)
          pendingLayersRef.current.push(m)
        })
      }
    })
  }, [geofence, pendingPolygon]) // eslint-disable-line react-hooks/exhaustive-deps

  // OSM search radius circle
  useEffect(() => {
    import('leaflet').then(L => {
      if (!mapRef.current) return
      const map = mapRef.current
      if (osmCircleRef.current) { osmCircleRef.current.remove(); osmCircleRef.current = null }
      if (!mapRef.current) return
      if (osmSearchCircle) {
        osmCircleRef.current = L.circle([osmSearchCircle.lat, osmSearchCircle.lng], {
          radius: osmSearchCircle.radius,
          color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.06, weight: 2, dashArray: '8 5',
        }).addTo(map)
      }
    })
  }, [osmSearchCircle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw markers
  useEffect(() => {
    import('leaflet').then(L => {
      if (!mapRef.current) return
      const map = mapRef.current
      ;(markersRef.current as Map<string, { remove: () => void }>).forEach(m => m.remove())
      markersRef.current.clear()

      // Home base marker
      if (homeBase) {
        const hbIcon = L.divIcon({
          className: '',
          html: `<div style="width:38px;height:38px;background:#fffbeb;border:2.5px solid #f59e0b;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(245,158,11,0.2)">🏠</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        })
        L.marker([homeBase.lat, homeBase.lng], { icon: hbIcon }).bindPopup('<b>Homebase</b>').addTo(map)
      }

      // Location markers
      locations.forEach(loc => {
        const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
        const owner = ownership.find(o => o.location_id === loc.id)
        const ownerColor = owner?.player?.color ?? '#4a5568'
        const region = regions?.find(r => r.id === (loc as Location & { region_id?: string | null }).region_id)
        const regionBar = region ? `<div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:${region.color};border-radius:0 0 9px 9px"></div>` : ''
        const dragIndicator = draggableLocations ? '<div style="position:absolute;top:1px;right:2px;font-size:7px;opacity:0.5">⠿</div>' : ''
        const icon = L.divIcon({
          html: `<div style="background:#fff;border:2.5px solid ${ownerColor};border-radius:12px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,0.12);position:relative;overflow:hidden">${config.emoji}${regionBar}${dragIndicator}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], className: '',
        })
        const popup = `<div style="font-family:monospace;font-size:11px;line-height:1.6"><b style="font-size:12px">${loc.name}</b><br><span style="opacity:.7">${config.label}</span>${owner ? `<br><span style="color:${ownerColor};font-weight:bold">◉ ${owner.player?.name}</span>` : '<br><span style="opacity:.5">◎ Onbezet</span>'}${draggableLocations ? '<br><span style="opacity:.4">sleep om te verplaatsen</span>' : ''}</div>`
        const marker = L.marker([loc.lat, loc.lng], { icon, draggable: !!draggableLocations }).bindPopup(popup).addTo(map)
        if (draggableLocations) {
          marker.on('dragend', () => {
            const ll = (marker as unknown as { getLatLng: () => { lat: number; lng: number } }).getLatLng()
            onLocationMoveRef.current?.(loc.id, ll.lat, ll.lng)
          })
        }
        markersRef.current.set(loc.id, marker)
      })

      // Template locations (draggable preview markers, not yet saved)
      templateLocations?.forEach(tl => {
        const config = LOCATION_TYPE_CONFIG[tl.type]
        const icon = L.divIcon({
          html: `<div style="background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px rgba(22,163,74,0.2);position:relative"><span style="position:absolute;top:0px;right:2px;font-size:7px;opacity:0.6">✦</span>${config.emoji}</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18], className: '',
        })
        const m = L.marker([tl.lat, tl.lng], { icon, draggable: true })
          .bindPopup(`<div style="font-family:monospace;font-size:11px"><b>${tl.name}</b><br><span style="opacity:.7">${config.label} (nieuw)</span><br><span style="opacity:.4">sleep om te verplaatsen</span></div>`)
          .addTo(map)
        m.on('dragend', () => {
          const ll = (m as unknown as { getLatLng: () => { lat: number; lng: number } }).getLatLng()
          onTemplateDragRef.current?.(tl.tempId, ll.lat, ll.lng)
        })
        markersRef.current.set(`tmpl-${tl.tempId}`, m)
      })

      // OSM candidates
      osmCandidates?.forEach(c => {
        const config = LOCATION_TYPE_CONFIG[c.type]
        const selected = selectedOsmIds?.has(c.id)
        const icon = L.divIcon({
          html: `<div style="background:${selected ? '#f0fdf4' : '#fefce8'};border:2px ${selected ? 'solid #22c55e' : 'dashed #ca8a04'};border-radius:12px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.1)">${config.emoji}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16], className: '',
        })
        const m = L.marker([c.lat, c.lng], { icon })
          .bindPopup(`<div style="font-family:monospace;font-size:11px"><b>${c.name}</b><br><span style="opacity:.7">${config.label}</span></div>`)
          .addTo(map)
        m.on('click', () => onOsmCandidateClick?.(c))
        markersRef.current.set(`osm-${c.id}`, m)
      })

      // Pending new location
      if (pendingLocation) {
        const icon = L.divIcon({
          html: `<div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:12px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#2563eb;font-weight:900;box-shadow:0 2px 8px rgba(59,130,246,0.15)">+</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16], className: '',
        })
        markersRef.current.set('pending', L.marker([pendingLocation.lat, pendingLocation.lng], { icon }).addTo(map))
      }

      // Live player positions
      if (liveMode && players) {
        players.filter(p => p.lat && p.lng).forEach(player => {
          const av = (player as Player & { avatar?: string }).avatar
          const inner = av
            ? `<span style="font-size:14px;line-height:1">${av}</span>`
            : `<span style="font-family:monospace;font-size:11px;font-weight:900;color:white;letter-spacing:-0.05em">${player.name.charAt(0)}</span>`
          const icon = L.divIcon({
            html: `<div style="background:${player.color};border:3px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">${inner}</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14], className: '',
          })
          L.marker([player.lat!, player.lng!], { icon })
            .bindPopup(`<div style="font-family:monospace;font-size:11px"><b>${player.name}</b><br>${player.crowns}◈</div>`)
            .addTo(map)
        })
      }

      // Fit bounds to locations — only once on initial load, not on every add
      if (locations.length > 0 && !hasAutoFitRef.current) {
        const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng]))
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40] })
          hasAutoFitRef.current = true
        }
      }
    })
  }, [locations, ownership, players, regions, pendingLocation, liveMode, osmCandidates, selectedOsmIds, homeBase, draggableLocations, templateLocations]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" />
}
