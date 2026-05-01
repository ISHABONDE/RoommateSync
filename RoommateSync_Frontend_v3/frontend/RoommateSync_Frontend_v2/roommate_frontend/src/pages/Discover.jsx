import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { recommendAPI } from '../api'
import { Avatar, ScorePill, PageLoader, EmptyState } from '../components/Shared'

const DEFAULT_CENTER = [18.6298, 73.7997]

// Lives INSIDE MapContainer — uses useMap() to flyTo without remounting the map
function MapViewSync({ center }) {
  const mapRef = useRef(null)

  // We receive the leaflet map instance via a callback ref set on MapContainer
  // Instead, we use a workaround: store map globally when it mounts
  return null
}

export default function Discover() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [nearby, setNearby]   = useState([])
  const [radius, setRadius]   = useState(5)
  const [loading, setLoading] = useState(false)
  const [MapComponents, setMapComponents] = useState(null)
  const mapIcons     = useRef(null)
  const leafletMap   = useRef(null)   // stores the actual Leaflet map instance

  // Stable center ref — used for fetches. Avoids stale closures.
  const centerRef = useRef(DEFAULT_CENTER)
  // Displayed center state — only used for initial MapContainer center prop
  const [initCenter] = useState(() => {
    const lat = parseFloat(user?.latitude)
    const lng = parseFloat(user?.longitude)
    return (lat && lng && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : DEFAULT_CENTER
  })

  // Whether user already set location manually (GPS) — blocks profile auto-apply
  const manualOverride         = useRef(false)
  const profileLocationApplied = useRef(false)

  // On first mount set centerRef from profile location if available
  useEffect(() => {
    const lat = parseFloat(user?.latitude)
    const lng = parseFloat(user?.longitude)
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      centerRef.current = [lat, lng]
      profileLocationApplied.current = true
    }
  }, [])                        // once only on mount

  // Load Leaflet dynamically — never at module level (prevents blank screen crash)
  useEffect(() => {
    Promise.all([import('leaflet'), import('react-leaflet')]).then(([L, rl]) => {
      delete L.default.Icon.Default.prototype._getIconUrl
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      mapIcons.current = {
        you: L.default.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#C4601A;border:3px solid #fff;box-shadow:0 2px 8px rgba(196,96,26,.5);"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        }),
        other: L.default.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:#185FA5;border:2px solid #fff;box-shadow:0 2px 6px rgba(24,95,165,.4);"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        }),
      }
      setMapComponents({
        MapContainer: rl.MapContainer,
        TileLayer:    rl.TileLayer,
        Marker:       rl.Marker,
        Popup:        rl.Popup,
        Circle:       rl.Circle,
        useMap:       rl.useMap,
      })
    })
  }, [])

  // Fetch nearby roommates using the current centerRef value
  const fetchNearby = useCallback(async (lat, lng, r) => {
    setLoading(true)
    try {
      const res = await recommendAPI.nearbyRoommates(lat, lng, r)
      if (res.data.success) setNearby(res.data.roommates || [])
    } catch { setNearby([]) }
    finally  { setLoading(false) }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    fetchNearby(centerRef.current[0], centerRef.current[1], radius)
  }, [])    // once only

  // Pan the Leaflet map smoothly to new coordinates without remounting
  const flyTo = useCallback((lat, lng) => {
    if (leafletMap.current) {
      leafletMap.current.flyTo([lat, lng], leafletMap.current.getZoom(), {
        animate: true, duration: 0.8,
      })
    }
  }, [])

  // GPS button — explicitly requested by user
  const useMyLocation = () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        manualOverride.current = true
        centerRef.current = [lat, lng]
        flyTo(lat, lng)                       // smooth pan, no remount
        fetchNearby(lat, lng, radius)
      },
      () => alert('Could not get location. Check browser permissions.')
    )
  }

  // Search button — uses whatever centerRef currently holds
  const handleSearch = () => {
    fetchNearby(centerRef.current[0], centerRef.current[1], radius)
  }

  // Coordinate display for the info line
  const [displayCenter, setDisplayCenter] = useState(initCenter)

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div><h1>Discover</h1><p>Find roommates near your location</p></div>
          <button className="btn btn-outline btn-sm" onClick={useMyLocation}>
            📍 Use my GPS
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* Radius + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>Radius:</span>
            <input type="range" min="1" max="20" step="1" value={radius}
              onChange={e => setRadius(parseInt(e.target.value, 10))} style={{ width: 120 }} />
            <span style={{ fontSize: 13, fontWeight: 500, minWidth: 40 }}>{radius} km</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
            {!loading && `${nearby.length} found`}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>
          Searching near {centerRef.current[0].toFixed(4)}, {centerRef.current[1].toFixed(4)}
          {manualOverride.current ? ' · GPS' : user?.city ? ` · ${user.city}` : ''}
        </div>

        {/* Map — NO key prop so it never remounts; flyTo handles movement */}
        <div className="map-container full" style={{ marginBottom: 28 }}>
          {MapComponents ? (
            <MapComponents.MapContainer
              center={initCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              ref={undefined}
              whenCreated={map => { leafletMap.current = map }}
            >
              <MapComponents.TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Your marker — positioned at initCenter; flyTo moves the view, not the marker */}
              {mapIcons.current && (
                <MapComponents.Marker position={initCenter} icon={mapIcons.current.you}>
                  <MapComponents.Popup>
                    <strong>You</strong><br />
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {centerRef.current[0].toFixed(4)}, {centerRef.current[1].toFixed(4)}
                    </span>
                  </MapComponents.Popup>
                </MapComponents.Marker>
              )}

              <MapComponents.Circle
                center={initCenter}
                radius={radius * 1000}
                pathOptions={{ color: '#C4601A', fillColor: '#C4601A', fillOpacity: 0.06, weight: 1.5, dashArray: '6 4' }}
              />

              {mapIcons.current && nearby.map(u => {
                const lat = parseFloat(u.latitude)
                const lng = parseFloat(u.longitude)
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null
                return (
                  <MapComponents.Marker key={u.user_id} position={[lat, lng]} icon={mapIcons.current.other}>
                    <MapComponents.Popup>
                      <div style={{ minWidth: 150, fontFamily: "'DM Sans', sans-serif" }}>
                        <div style={{ fontWeight: 500 }}>{u.name || 'Anonymous'}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {u.city || ''}{u.distance_km != null ? ` · ${u.distance_km} km` : ''}
                        </div>
                        {u.compatibility_score != null && (
                          <div style={{ marginTop: 5, fontSize: 12, color: '#C4601A', fontWeight: 500 }}>
                            {u.compatibility_score}% match
                          </div>
                        )}
                        <button onClick={() => navigate(`/user/${u.user_id}`)}
                          style={{ marginTop: 8, width: '100%', padding: '5px', background: '#C4601A',
                            color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                          View profile →
                        </button>
                      </div>
                    </MapComponents.Popup>
                  </MapComponents.Marker>
                )
              })}
            </MapComponents.MapContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-hover)', color: 'var(--txt2)', fontSize: 13 }}>
              Loading map…
            </div>
          )}
        </div>

        {/* List */}
        <h2 style={{ fontSize: 20, marginBottom: 16 }}>Nearby roommates</h2>
        {loading ? <PageLoader /> : nearby.length === 0 ? (
          <EmptyState icon="📍" title="No roommates found"
            subtitle="Try increasing the radius or tap Search after moving location." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nearby.map(u => (
              <div key={u.user_id} className="match-card" onClick={() => navigate(`/user/${u.user_id}`)}>
                <Avatar name={u.name} src={u.profile_image || ''} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{u.name || 'Anonymous'}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
                    {[u.area, u.city].filter(Boolean).join(', ')}
                    {u.distance_km != null ? ` · ${u.distance_km} km away` : ''}
                  </div>
                </div>
                {u.compatibility_score != null && <ScorePill score={u.compatibility_score} />}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--txt3)', flexShrink: 0 }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
