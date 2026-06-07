'use client'

import { useEffect, useRef } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'

interface Props {
  locations: Location[]
  ownership: (LocationOwnership & { player: Player })[]
  players?: Player[]
  addingMode: boolean
  onMapClick: (lat: number, lng: number) => void
  pendingLocation: { lat: number; lng: number } | null
  onDeleteLocation: (id: string) => void
  liveMode?: boolean
}

export default function HostMap({
  locations, ownership, players, addingMode, onMapClick, pendingLocation, liveMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null)
  const markersRef = useRef<Map<string, ReturnType<typeof import('leaflet')['marker']>>>(new Map())

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then(L => {
      const map = L.map(containerRef.current!, {
        center: [52.37, 4.9],
        zoom: 14,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        onMapClick(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current!

      map.getContainer().style.cursor = addingMode ? 'crosshair' : ''

      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()

      locations.forEach(loc => {
        const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
        const owner = ownership.find(o => o.location_id === loc.id)
        const color = owner ? owner.player?.color : '#ffffff40'

        const icon = L.divIcon({
          html: `<div style="background:${color};border:2px solid ${color};border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 0 4px ${color}30">${config.emoji}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          className: '',
        })

        const marker = L.marker([loc.lat, loc.lng], { icon })
          .bindPopup(`<b>${loc.name}</b><br>${config.label}${owner ? `<br>Eigenaar: ${owner.player?.name}` : ''}`)
          .addTo(map)
        markersRef.current.set(loc.id, marker)
      })

      if (pendingLocation) {
        const icon = L.divIcon({
          html: `<div style="background:#f59e0b;border:2px solid #f59e0b;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px">📍</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          className: '',
        })
        L.marker([pendingLocation.lat, pendingLocation.lng], { icon }).addTo(map)
      }

      if (liveMode && players) {
        players.filter(p => p.lat && p.lng).forEach(player => {
          const icon = L.divIcon({
            html: `<div style="background:${player.color};border:3px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white;text-shadow:0 1px 2px #0006">${player.name.charAt(0)}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            className: '',
          })
          L.marker([player.lat!, player.lng!], { icon })
            .bindPopup(`<b>${player.name}</b><br>${player.crowns} kronen`)
            .addTo(map)
        })
      }

      if (locations.length > 0 && !map.getBounds().isValid()) {
        const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng]))
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    })
  }, [locations, ownership, players, pendingLocation, addingMode, liveMode])

  return <div ref={containerRef} className="w-full h-full" />
}
