import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import toast from 'react-hot-toast'
import { roomsAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import { PageLoader, EmptyState, Spinner } from '../components/Shared'
import { formatCurrency } from '../utils/helpers'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const TABS = ['All rooms', 'Nearby', 'My listings']
const FILTERS = ['All', 'Furnished', 'WiFi', 'Parking', 'Available']

export default function Rooms() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [tab, setTab]         = useState(0)
  const [filter, setFilter]   = useState('All')
  const [rooms, setRooms]     = useState([])
  const [nearby, setNearby]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadRooms() }, [])

  const loadRooms = async () => {
    setLoading(true)
    try {
      const res = await roomsAPI.list()
      if (res.data.success) setRooms(res.data.rooms || [])
      if (user?.latitude) {
        const nr = await roomsAPI.nearby(user.latitude, user.longitude)
        if (nr.data.success) setNearby(nr.data.rooms || [])
      }
    } catch {} finally { setLoading(false) }
  }

  const myListings = rooms.filter(r => r.owner_id === user?.user_id)
  const displayedRooms = tab === 0 ? rooms : tab === 1 ? nearby : myListings

  const filteredRooms = displayedRooms.filter(r => {
    if (filter === 'All') return true
    if (filter === 'Furnished') return r.furnished
    if (filter === 'WiFi')      return r.wifi
    if (filter === 'Parking')   return r.parking
    if (filter === 'Available') return r.room_status === 'available'
    return true
  })

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><h1>Rooms</h1><p>Browse available rooms near you</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + List a room
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20 }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`btn btn-sm ${tab === i ? 'btn-primary' : 'btn-ghost'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* Map for nearby tab */}
        {tab === 1 && nearby.length > 0 && user?.latitude && (
          <div className="map-container fade-up fade-up-1" style={{ marginBottom: 24 }}>
            <MapContainer center={[user.latitude, user.longitude]} zoom={13} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors' />
              {nearby.map(r => r.latitude && r.longitude && (
                <Marker key={r.room_id || r.id} position={[r.latitude, r.longitude]}>
                  <Popup>
                    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      <div style={{ fontWeight: 500 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{r.distance_km} km · {formatCurrency(r.rent)}/mo</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Filters */}
        <div className="fade-up fade-up-2" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
              {f}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--txt2)', alignSelf: 'center' }}>
            {filteredRooms.length} rooms
          </span>
        </div>

        {/* Grid */}
        {loading ? <PageLoader /> : filteredRooms.length === 0 ? (
          <EmptyState icon="🏠" title="No rooms found"
            subtitle="Try changing your filters or list your own room."
            action={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>List a room</button>} />
        ) : (
          <div className="fade-up fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredRooms.map(r => <RoomCard key={r.id || r.room_id} room={r} onView={() => navigate(`/rooms/${r.id || r.room_id}`)} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => { setShowCreate(false); loadRooms() }} />}
    </div>
  )
}

function RoomCard({ room, onView }) {
  const img = room.photos?.[0]
  return (
    <div className="room-card" onClick={onView}>
      <div className="room-card-img">
        {img ? <img src={img} alt={room.title} /> : (
          <div style={{ width: '100%', height: '100%', background: `hsl(${(room.title?.charCodeAt(0) ?? 0) % 360}, 30%, 88%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M5 16L18 5l13 11V31H23v-8h-10v8H5V16Z" stroke="#888" strokeWidth="1.5"/></svg>
          </div>
        )}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          {room.furnished && <span className="badge badge-green" style={{ fontSize: 10 }}>Furnished</span>}
          {room.wifi && <span className="badge badge-blue" style={{ fontSize: 10 }}>WiFi</span>}
        </div>
        {room.distance_km != null && (
          <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 6, fontSize: 11, padding: '3px 8px' }}>
            {room.distance_km} km
          </div>
        )}
      </div>
      <div className="room-card-body">
        <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 3 }}>{room.title || 'Untitled Room'}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
          {[room.area, room.city].filter(Boolean).join(', ') || 'Location not set'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, color: 'var(--brand)' }}>
            {formatCurrency(room.rent)}<span style={{ fontSize: 12, color: 'var(--txt2)', fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}>/mo</span>
          </div>
          <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); onView() }}>View</button>
        </div>
      </div>
    </div>
  )
}

function CreateRoomModal({ onClose }) {
  const [form, setForm]               = useState({
    title: '', description: '', city: '', area: '', rent: '',
    latitude: '', longitude: '', furnished: false, wifi: false, parking: false,
    room_status: 'available',
  })
  const [agreementFile, setAgreementFile] = useState(null)
  const [loading, setLoading]         = useState(false)
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const toggle = key => setForm(f => ({ ...f, [key]: !f[key] }))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = {
        ...form,
        rent:      Number(form.rent),
        latitude:  Number(form.latitude)  || undefined,
        longitude: Number(form.longitude) || undefined,
      }
      const res = await roomsAPI.create(data)
      const roomId = res.data.room_id

      // Upload agreement if provided
      if (agreementFile && roomId) {
        try {
          const af = new FormData()
          af.append('agreement', agreementFile)
          await roomsAPI.uploadAgreement(roomId, af)
        } catch { /* agreement upload failure is non-fatal */ }
      }

      toast.success('Room listed successfully!')
      onClose()
    } catch {
      toast.error('Failed to create listing.')
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 22 }}>List a room</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[['title','Title','1BHK in Hinjewadi'],['description','Description','Describe the room…'],['city','City','Pune'],['area','Area','Hinjewadi'],['rent','Monthly rent (₹)','8000']].map(([name, label, placeholder]) => (
            <div className="input-wrap" key={name}>
              <label className="input-label">{label}</label>
              {name === 'description'
                ? <textarea className="input" name={name} placeholder={placeholder} value={form[name]} onChange={handle} rows={2} style={{ resize: 'vertical' }} />
                : <input className="input" name={name} placeholder={placeholder} value={form[name]} onChange={handle} required={name !== 'description'} />
              }
            </div>
          ))}

          <div className="grid-2">
            <div className="input-wrap">
              <label className="input-label">Latitude</label>
              <input className="input" name="latitude" placeholder="18.6298" value={form.latitude} onChange={handle} />
            </div>
            <div className="input-wrap">
              <label className="input-label">Longitude</label>
              <input className="input" name="longitude" placeholder="73.7997" value={form.longitude} onChange={handle} />
            </div>
          </div>

          {/* Amenities */}
          <div>
            <label className="input-label" style={{ display: 'block', marginBottom: 8 }}>Amenities</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['furnished','Furnished'],['wifi','WiFi'],['parking','Parking']].map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => toggle(key)}
                  className={`btn btn-sm ${form[key] ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12 }}>
                  {form[key] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="input-wrap">
            <label className="input-label">Availability</label>
            <select className="input" name="room_status" value={form.room_status} onChange={handle}>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          {/* Agreement upload */}
          <div>
            <label className="input-label" style={{ display: 'block', marginBottom: 8 }}>
              Room Agreement <span style={{ color: 'var(--txt2)', fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: 'var(--bg-hover)', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 20 }}>{agreementFile ? '📋' : '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {agreementFile ? agreementFile.name : 'Upload rental agreement'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>
                  PDF, JPG or PNG · max 16 MB
                </div>
              </div>
              <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
                {agreementFile ? 'Change' : 'Browse'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => setAgreementFile(e.target.files[0] || null)} />
              </label>
              {agreementFile && (
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => setAgreementFile(null)}
                  style={{ color: 'var(--txt2)', padding: '4px 8px' }}>✕</button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Creating…' : 'Create listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
