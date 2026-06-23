'use client'

import { useEffect, useRef } from 'react'
import { Location, Player, LocationOwnership, LOCATION_TYPE_CONFIG, LocationType, Geofence } from '@/lib/types'
import { getDistanceMeters } from '@/lib/game-logic'

interface SecretPowerup {
  id: string
  emoji: string
  label: string
  lat: number
  lng: number
}

interface AllianceInfo {
  id: string
  color: string
}

interface RegionInfo {
  id: string
  color: string
  name: string
}

interface Props {
  locations: Location[]
  ownership: (LocationOwnership & { player: Player })[]
  players: Player[]
  myPlayerId: string
  myPos: { lat: number; lng: number } | null
  onLocationSelect: (loc: Location) => void
  secretPowerups?: SecretPowerup[]
  geofence?: Geofence | null
  homeBase?: { lat: number; lng: number } | null
  alliances?: AllianceInfo[]
  myAllianceId?: string | null
  regions?: RegionInfo[]
  missionLocationId?: string | null
  boostedLocationId?: string | null
}

export default function PlayerMap({ locations, ownership, players, myPlayerId, myPos, onLocationSelect, secretPowerups, geofence, homeBase, alliances, myAllianceId, regions, missionLocationId, boostedLocationId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null)
  const myMarkerRef = useRef<ReturnType<typeof import('leaflet')['marker']> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current) return
      const el = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
      if (el._leaflet_id) return
      const map = L.map(containerRef.current, {
        center: myPos ? [myPos.lat, myPos.lng] : [52.37, 4.9],
        zoom: 17,
        zoomControl: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      mapRef.current = map
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      myMarkerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw locations and other players
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current!
      const allLayers: { remove: () => void }[] = []

      locations.forEach(loc => {
        const config = LOCATION_TYPE_CONFIG[loc.type as LocationType]
        const owner = ownership.find(o => o.location_id === loc.id)
        const ownerColor = owner?.player?.color ?? '#94a3b8'
        const isNearby = myPos ? getDistanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng) <= loc.claim_radius * 1.5 : false
        const canClaim = myPos ? getDistanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng) <= loc.claim_radius : false

        const sz = canClaim ? 52 : 42
        const region = regions?.find(r => r.id === (loc as Location & { region_id?: string | null }).region_id)
        const regionBar = region ? `<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${region.color}"></div>` : ''
        const ownerStrip = `<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${ownerColor};border-radius:0 0 8px 8px"></div>`
        const defLevel = owner?.defense_level ?? 0
        const defBadge = defLevel > 0
          ? `<div style="position:absolute;top:-5px;right:-5px;background:#3b82f6;color:#fff;font-size:8px;font-weight:900;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(59,130,246,0.5);padding:0 2px">🛡${defLevel}</div>`
          : ''
        const isMission = missionLocationId === loc.id
        const isBoosted = boostedLocationId === loc.id
        const missionBadge = isMission
          ? `<div style="position:absolute;top:-5px;left:-5px;background:#f59e0b;color:#fff;font-size:9px;font-weight:900;padding:1px 4px;border-radius:6px;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(245,158,11,0.5);white-space:nowrap">🎯</div>`
          : ''
        const boostBadge = isBoosted
          ? `<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;font-size:8px;font-weight:900;padding:1px 4px;border-radius:6px;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(34,197,94,0.5);white-space:nowrap">⚡3×</div>`
          : ''
        const icon = L.divIcon({
          html: `<div style="
            background:linear-gradient(145deg,#1e293b,#0f172a);
            border:2px solid ${ownerColor};
            border-radius:10px;
            width:${sz}px;height:${sz}px;
            display:flex;align-items:center;justify-content:center;
            font-size:${canClaim ? '26px' : '20px'};
            box-shadow:${canClaim ? `0 0 0 3px ${ownerColor}50,0 0 16px ${ownerColor}30,` : ''}0 3px 10px rgba(0,0,0,0.5);
            position:relative;overflow:hidden;
          ">${config.emoji}${ownerStrip}${regionBar}${defBadge}${missionBadge}${boostBadge}</div>`,
          iconSize: [sz, sz],
          iconAnchor: [sz / 2, sz / 2],
          className: '',
        })

        const marker = L.marker([loc.lat, loc.lng], { icon })
        marker.on('click', () => onLocationSelect(loc))
        marker.addTo(map)
        allLayers.push(marker)

        // Claim radius ring (only when in range)
        if (isNearby) {
          const ring = L.circle([loc.lat, loc.lng], {
            radius: loc.claim_radius,
            color: ownerColor,
            fillColor: ownerColor,
            fillOpacity: canClaim ? 0.14 : 0.05,
            weight: canClaim ? 2.5 : 1.5,
            dashArray: canClaim ? undefined : '8 6',
          }).addTo(map)
          allLayers.push(ring)
        }

        // Owner name label underneath
        if (owner?.player) {
          const label = L.divIcon({
            html: `<div style="background:#fff;color:${ownerColor};font-family:system-ui,sans-serif;font-size:11px;font-weight:700;padding:3px 7px;border-radius:8px;border:1.5px solid ${ownerColor}70;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15)">${owner.player.name}</div>`,
            className: '',
            iconAnchor: [0, -26],
          })
          allLayers.push(L.marker([loc.lat, loc.lng], { icon: label, interactive: false, zIndexOffset: -1 }).addTo(map))
        }
      })

      // Other players
      players.filter(p => p.id !== myPlayerId && p.lat && p.lng).forEach(p => {
        const av = (p as Player & { avatar?: string }).avatar
        const inner = av
          ? `<span style="font-size:16px;line-height:1">${av}</span>`
          : `<span style="font-size:12px;font-weight:bold;color:white">${p.name.charAt(0)}</span>`
        const isAlly = myAllianceId && (p as Player & { alliance_id?: string | null }).alliance_id === myAllianceId
        const allyColor = isAlly ? (alliances?.find(a => a.id === myAllianceId)?.color ?? '#22c55e') : null
        const icon = L.divIcon({
          html: `<div style="background:${p.color};border:3px solid #fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2)${allyColor ? `,0 0 0 3px ${allyColor}` : ''}">${inner}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          className: '',
        })
        const popup = isAlly ? `<b>${p.name}</b> 🤝<br>${p.crowns} 👑` : `<b>${p.name}</b><br>${p.crowns} 👑`
        allLayers.push(L.marker([p.lat!, p.lng!], { icon }).bindPopup(popup).addTo(map))
      })

      // Secret powerup locations (🗝️ buff active)
      secretPowerups?.forEach(p => {
        const icon = L.divIcon({
          html: `<div style="background:#faf5ff;border:2px dashed #8b5cf6;border-radius:12px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(139,92,246,0.2)">${p.emoji}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16], className: '',
        })
        allLayers.push(L.marker([p.lat, p.lng], { icon }).bindPopup(`<div style="font-family:monospace;font-size:11px"><b>${p.label}</b><br><span style="opacity:.6">🗝 Geheime locatie</span></div>`).addTo(map))
      })

      return () => allLayers.forEach(l => l.remove())
    })
  }, [locations, ownership, players, myPlayerId, myPos, onLocationSelect, secretPowerups, regions, missionLocationId, boostedLocationId])

  // Draw geofence zone + home base
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return
      const layers: { remove: () => void }[] = []

      if (geofence) {
        const zoneStyle = { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.08, weight: 2, dashArray: '8 5' }
        if (geofence.type === 'polygon') {
          layers.push(L.polygon(geofence.points.map(p => [p.lat, p.lng] as [number, number]), zoneStyle).addTo(map))
        } else {
          layers.push(L.circle([geofence.lat, geofence.lng], { ...zoneStyle, radius: geofence.radius_meters }).addTo(map))
        }
      }

      if (homeBase) {
        const icon = L.divIcon({
          html: `<div style="background:#fffbeb;border:2.5px solid #f59e0b;border-radius:12px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(245,158,11,0.25)">🏠</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          className: '',
        })
        layers.push(L.marker([homeBase.lat, homeBase.lng], { icon }).bindPopup('<div style="font-family:monospace;font-size:11px"><b>Homebase</b></div>').addTo(map))
      }

      return () => layers.forEach(l => l.remove())
    })
  }, [geofence, homeBase])

  // Update my position marker
  useEffect(() => {
    if (!mapRef.current || !myPos) return
    import('leaflet').then(L => {
      const map = mapRef.current!
      if (myMarkerRef.current) {
        myMarkerRef.current.setLatLng([myPos.lat, myPos.lng])
      } else {
        const me = players.find(p => p.id === myPlayerId) as (Player & { avatar?: string }) | undefined
        const av = me?.avatar
        const col = me?.color ?? '#2563eb'
        const inner = av
          ? `<span style="font-size:17px;line-height:1">${av}</span>`
          : `<span style="font-size:11px;font-weight:900;color:#fff;font-family:monospace;letter-spacing:-0.5px">${me?.name?.charAt(0) ?? '◉'}</span>`
        const icon = L.divIcon({
          html: `<div style="
            width:34px;height:34px;
            background:${col};
            border:3px solid #fff;
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 0 0 3px ${col}60,0 3px 12px rgba(0,0,0,0.35);
            position:relative;
          ">
            ${inner}
            <div style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;background:#22c55e;border:2px solid #fff;border-radius:50%"></div>
          </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          className: '',
        })
        myMarkerRef.current = L.marker([myPos.lat, myPos.lng], { icon, zIndexOffset: 1000 }).addTo(map)
        map.setView([myPos.lat, myPos.lng], 17)
      }
    })
  }, [myPos, players, myPlayerId])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <button
        onClick={() => { if (mapRef.current && myPos) mapRef.current.setView([myPos.lat, myPos.lng], 17) }}
        className="absolute bottom-4 right-4 z-[1000] w-11 h-11 flex items-center justify-center text-lg font-bold transition-all"
        style={{ background: '#fff', border: '1.5px solid var(--border2)', color: 'var(--blue)', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}
      >
        ◉
      </button>
    </div>
  )
}
