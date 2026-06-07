'use client'

import { useEffect, useRef } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType } from '@/lib/types'
import { getDistanceMeters } from '@/lib/game-logic'

interface Props {
  locations: Location[]
  ownership: (LocationOwnership & { player: Player })[]
  players: Player[]
  myPlayerId: string
  myPos: { lat: number; lng: number } | null
  onLocationSelect: (loc: Location) => void
}

export default function PlayerMap({ locations, ownership, players, myPlayerId, myPos, onLocationSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null)
  const myMarkerRef = useRef<ReturnType<typeof import('leaflet')['marker']> | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!containerRef.current || initialized.current) return
    initialized.current = true

    import('leaflet').then(L => {
      const map = L.map(containerRef.current!, {
        center: myPos ? [myPos.lat, myPos.lng] : [52.37, 4.9],
        zoom: 16,
        zoomControl: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      initialized.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current!
      const allLayers: ReturnType<typeof L.marker>[] = []

      locations.forEach(loc => {
        const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
        const owner = ownership.find(o => o.location_id === loc.id)
        const color = owner?.player?.color ?? '#ffffff40'
        const isNearby = myPos ? getDistanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng) <= loc.claim_radius : false

        const icon = L.divIcon({
          html: `<div style="
            background:${color}22;
            border:2px solid ${color};
            border-radius:50%;
            width:44px;height:44px;
            display:flex;align-items:center;justify-content:center;
            font-size:22px;
            box-shadow:0 0 0 ${isNearby ? '8px' : '3px'} ${color}${isNearby ? '60' : '20'};
            transition:all 0.3s;
          ">${config.emoji}</div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          className: '',
        })

        const marker = L.marker([loc.lat, loc.lng], { icon })
        marker.on('click', () => onLocationSelect(loc))
        marker.addTo(map)
        allLayers.push(marker)

        if (isNearby) {
          const ring = L.circle([loc.lat, loc.lng], {
            radius: loc.claim_radius,
            color: color,
            fillColor: color,
            fillOpacity: 0.06,
            weight: 1,
          }).addTo(map)
          allLayers.push(ring as unknown as ReturnType<typeof L.marker>)
        }
      })

      players.filter(p => p.id !== myPlayerId && p.lat && p.lng).forEach(p => {
        const icon = L.divIcon({
          html: `<div style="background:${p.color};border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white">${p.name.charAt(0)}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          className: '',
        })
        L.marker([p.lat!, p.lng!], { icon }).bindPopup(`<b>${p.name}</b>`).addTo(map)
      })

      return () => allLayers.forEach(l => l.remove())
    })
  }, [locations, ownership, players, myPlayerId, myPos, onLocationSelect])

  useEffect(() => {
    if (!mapRef.current || !myPos) return
    import('leaflet').then(L => {
      const map = mapRef.current!
      if (myMarkerRef.current) {
        myMarkerRef.current.setLatLng([myPos.lat, myPos.lng])
      } else {
        const icon = L.divIcon({
          html: `<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px #3b82f640"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: '',
        })
        myMarkerRef.current = L.marker([myPos.lat, myPos.lng], { icon, zIndexOffset: 1000 }).addTo(map)
        map.setView([myPos.lat, myPos.lng], 16)
      }
    })
  }, [myPos])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Center on me button */}
      <button
        onClick={() => { if (mapRef.current && myPos) mapRef.current.setView([myPos.lat, myPos.lng], 16) }}
        className="absolute bottom-4 right-4 z-[1000] w-10 h-10 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-lg shadow-lg hover:bg-white/20"
      >
        🎯
      </button>
    </div>
  )
}
