import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { adminAPI } from '../api/Admin'
import { Avatar, PageLoader, Spinner } from '../components/Shared'
import { formatRelativeTime, formatCurrency, verificationLabel } from '../utils/helpers'
import toast from 'react-hot-toast'

const TABS = ['Dashboard', 'Users', 'KYC Review', 'Rooms', 'ML Model']
const VER_LABELS = { 0: 'Not verified', 1: 'Pending', 2: 'Verified', 3: 'Rejected' }
const VER_COLORS = {
  0: { bg: 'var(--bg-hover)', color: 'var(--txt2)' },
  1: { bg: '#E6F1FB', color: '#185FA5' },
  2: { bg: '#EAF3DE', color: '#3B6D11' },
  3: { bg: '#FCEBEB', color: '#A32D2D' },
}

export default function Admin() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [tab, setTab]       = useState(0)
  const [loading, setLoading] = useState(true)

  // Guard — redirect non-admins immediately
  useEffect(() => {
    if (!user) return
    if (!user.is_admin) {
      toast.error('Admin access required.')
      navigate('/')
    } else {
      setLoading(false)
    }
  }, [user])

  if (loading) return <PageLoader />

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1>Admin panel</h1>
            <p>Manage users, KYC reviews, rooms and ML model</p>
          </div>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99,
            background: '#FAEEDA', color: '#633806', fontWeight: 500 }}>
            Admin
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 16, flexWrap: 'wrap' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`btn btn-sm ${tab === i ? 'btn-primary' : 'btn-ghost'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {tab === 0 && <DashboardTab />}
        {tab === 1 && <UsersTab />}
        {tab === 2 && <KycTab />}
        {tab === 3 && <RoomsTab />}
        {tab === 4 && <ModelTab />}
      </div>
    </div>
  )
}

// ── Tab: Dashboard ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.analytics()
      .then(r => { if (r.data.success) setStats(r.data.analytics) })
      .catch(() => toast.error('Failed to load stats.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />
  if (!stats)  return null

  const cards = [
    { label: 'Total users',      value: stats.total_users },
    { label: 'Email verified',   value: stats.email_verified },
    { label: 'KYC verified',     value: stats.kyc_verified },
    { label: 'KYC pending',      value: stats.kyc_pending, highlight: stats.kyc_pending > 0 },
    { label: 'KYC rejected',     value: stats.kyc_rejected },
    { label: 'Admin users',      value: stats.admin_users },
    { label: 'Total rooms',      value: stats.total_rooms },
    { label: 'Chat sessions',    value: stats.total_chats },
    { label: 'Accepted chats',   value: stats.accepted_chats },
    { label: 'Total messages',   value: stats.total_messages },
  ]

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {cards.map(c => (
          <div key={c.label} className="stat-card" style={{
            border: c.highlight ? '1px solid var(--brand)' : '1px solid var(--border)',
          }}>
            <div className="stat-num" style={{ fontSize: 28, color: c.highlight ? 'var(--brand)' : undefined }}>
              {c.value}
            </div>
            <div className="stat-lbl">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Users ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [acting, setActing]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminAPI.listUsers({ page, limit: 15, search, verified: filter })
      if (r.data.success) { setUsers(r.data.users); setTotal(r.data.total) }
    } catch {} finally { setLoading(false) }
  }, [page, search, filter])

  useEffect(() => { load() }, [load])

  const deleteUser = async (id, name) => {
    if (!window.confirm(`Delete user "${name}" and all their data? This cannot be undone.`)) return
    setActing(id)
    try {
      await adminAPI.deleteUser(id)
      toast.success('User deleted.')
      load()
      if (selected?.id === id) setSelected(null)
    } catch { toast.error('Delete failed.') }
    finally { setActing(null) }
  }

  const toggleAdmin = async (u) => {
    const newVal = !u.is_admin
    setActing(u.id)
    try {
      await adminAPI.promoteUser(u.id, newVal)
      toast.success(newVal ? `${u.name} is now admin.` : `Admin role removed from ${u.name}.`)
      load()
    } catch { toast.error('Failed.') }
    finally { setActing(null) }
  }

  const pages = Math.ceil(total / 15)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 320px' : '1fr', gap: 16 }}>
      {/* List */}
      <div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Search name or email…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ flex: 1, minWidth: 200 }} />
          <select className="input" style={{ width: 160 }} value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            <option value="0">Not verified</option>
            <option value="1">Pending KYC</option>
            <option value="2">Verified</option>
            <option value="3">Rejected</option>
          </select>
        </div>

        {/* Table */}
        {loading ? <PageLoader /> : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Email', 'Status', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--txt2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id}
                    style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                      background: selected?.id === u.id ? 'var(--bg-hover)' : 'transparent',
                      cursor: 'pointer' }}
                    onClick={() => setSelected(u)}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={u.name} src={u.profile_image} size={30} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name}</div>
                          {u.is_admin && <span style={{ fontSize: 10, color: '#633806', background: '#FAEEDA', padding: '1px 6px', borderRadius: 99 }}>admin</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--txt2)' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                        background: VER_COLORS[u.verification_status]?.bg,
                        color: VER_COLORS[u.verification_status]?.color }}>
                        {VER_LABELS[u.verification_status] ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12 }}>
                      {formatRelativeTime(u.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => toggleAdmin(u)} disabled={acting === u.id}>
                          {acting === u.id ? <Spinner size={12} /> : u.is_admin ? 'Revoke admin' : 'Make admin'}
                        </button>
                        <button className="btn btn-sm" style={{ color: '#A32D2D', border: '1px solid #F09595' }}
                          onClick={() => deleteUser(u.id, u.name)} disabled={acting === u.id}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{total} users total</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 13, lineHeight: '30px', padding: '0 8px' }}>{page} / {pages || 1}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card" style={{ position: 'sticky', top: 16, alignSelf: 'start', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>User detail</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Avatar name={selected.name} src={selected.profile_image} size={48} />
            <div>
              <div style={{ fontWeight: 500 }}>{selected.name}</div>
              <div style={{ color: 'var(--txt2)', fontSize: 12 }}>{selected.email}</div>
            </div>
          </div>
          <div className="divider" />
          {[
            ['Phone',       selected.phone     || '—'],
            ['City',        selected.city      || '—'],
            ['KYC status',  VER_LABELS[selected.verification_status] ?? '—'],
            ['Email verified', selected.email_verified ? 'Yes' : 'No'],
            ['Admin',       selected.is_admin  ? 'Yes' : 'No'],
            ['Budget',      selected.room_rent ? formatCurrency(selected.room_rent) + '/mo' : '—'],
            ['Joined',      formatRelativeTime(selected.created_at)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border)' }}>
              <span style={{ color: 'var(--txt2)' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          {selected.profile_image && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>Profile photo</div>
              <img src={selected.profile_image} alt="profile"
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
          )}
          {selected.id_document && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>ID document</div>
              <img src={selected.id_document} alt="id"
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
              {selected.ocr_data?.name && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--txt2)' }}>
                  OCR: {selected.ocr_data.name} · {selected.ocr_data.id_number}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: KYC Review ────────────────────────────────────────────────────────────
function KycTab() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await adminAPI.pendingKyc()
      if (r.data.success) setUsers(r.data.users)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const decide = async (userId, status, reason = '') => {
    setActing(userId + status)
    try {
      await adminAPI.verifyDocument({ user_id: userId, status, reason })
      toast.success(status === 2 ? 'KYC approved!' : 'KYC rejected.')
      load()
    } catch { toast.error('Action failed.') }
    finally { setActing(null) }
  }

  if (loading) return <PageLoader />

  return (
    <div>
      {/* Automation explanation banner */}
      <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 'var(--r)',
        padding: '14px 18px', marginBottom: 24, fontSize: 13 }}>
        <div style={{ fontWeight: 500, color: '#0C447C', marginBottom: 8 }}>How automated KYC works</div>
        <div style={{ color: '#185FA5', lineHeight: 1.9 }}>
          <span style={{ display:'inline-block', marginRight:8 }}>✅</span>
          <strong>Face found + OCR name matches profile + ID extracted</strong>
          → instantly <span style={{ color:'#27500A', fontWeight:500 }}>Verified</span><br/>
          <span style={{ display:'inline-block', marginRight:8 }}>❌</span>
          <strong>No face detected in selfie</strong>
          → instantly <span style={{ color:'#791F1F', fontWeight:500 }}>Rejected</span><br/>
          <span style={{ display:'inline-block', marginRight:8 }}>❌</span>
          <strong>Name on ID does not match profile name</strong>
          → instantly <span style={{ color:'#791F1F', fontWeight:500 }}>Rejected</span><br/>
          <span style={{ display:'inline-block', marginRight:8 }}>⏳</span>
          <strong>Face found but OCR could not read document clearly</strong>
          → <span style={{ color:'#854F0B', fontWeight:500 }}>Pending manual review</span> (shown below)
        </div>
      </div>

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20 }}>All caught up</h3>
          <p style={{ color: 'var(--txt2)', marginTop: 6 }}>
            No submissions need manual review. The automation handled everything.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 16 }}>
            {users.length} submission{users.length !== 1 ? 's' : ''} need manual review
            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: '#FAEEDA', color: '#633806' }}>
              OCR could not read document clearly
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {users.map(u => (
              <div key={u.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <Avatar name={u.name} src={u.profile_image} size={48} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
                      {u.email} · Submitted {formatRelativeTime(u.created_at)}
                    </div>
                    {/* Name comparison — profile name vs OCR name */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 6 }}>Name comparison</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                          background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--txt2)' }}>
                          Registered: <strong style={{ color: 'var(--txt)' }}>{u.name}</strong>
                        </span>
                        <span style={{ fontSize: 11, padding: '2px 6px', color: 'var(--txt3)' }}>vs</span>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                          background: u.ocr_data?.name ? '#E6F1FB' : '#FCEBEB',
                          color: u.ocr_data?.name ? '#0C447C' : '#791F1F' }}>
                          ID name: {u.ocr_data?.name || '⚠ not extracted'}
                        </span>
                        {u.ocr_data?.id_number && (
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                            background: '#EAF3DE', color: '#27500A' }}>
                            ID: {u.ocr_data.id_number}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: '#854F0B',
                        background: '#FFF8E6', padding: '4px 10px', borderRadius: 6,
                        border: '1px solid #FAC775', display: 'inline-block' }}>
                        Sent to review because OCR could not extract {!u.ocr_data?.name ? 'name' : 'ID number'} — compare manually
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => decide(u.id, 2)} disabled={!!acting}>
                      {acting === u.id + 2 ? <Spinner size={14} /> : '✓ Approve manually'}
                    </button>
                    <button className="btn btn-sm" style={{ color: '#A32D2D', border: '1px solid #F09595' }}
                      onClick={() => decide(u.id, 3, 'Rejected by admin after manual review')} disabled={!!acting}>
                      {acting === u.id + 3 ? <Spinner size={14} /> : '✕ Reject'}
                    </button>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 12 }}>
                  {u.id_document && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>
                        ID document
                        <span style={{ marginLeft: 6, color: '#854F0B' }}>— OCR result unclear</span>
                      </div>
                      <img src={u.id_document} alt="ID"
                        style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 220, objectFit: 'cover' }} />
                      {u.ocr_text && (
                        <div style={{ marginTop: 8, fontSize: 11, padding: '8px 10px',
                          background: 'var(--bg-hover)', borderRadius: 6,
                          fontFamily: 'var(--font-mono)', lineHeight: 1.5,
                          maxHeight: 80, overflow: 'auto', color: 'var(--txt2)' }}>
                          {u.ocr_text?.slice(0, 200)}…
                        </div>
                      )}
                    </div>
                  )}
                  {u.profile_image && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>
                        Selfie
                        <span style={{ marginLeft: 6, color: '#27500A' }}>— face detected ✓</span>
                      </div>
                      <img src={u.profile_image} alt="selfie"
                        style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 220, objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Rooms ─────────────────────────────────────────────────────────────────
function RoomsTab() {
  const [rooms, setRooms]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminAPI.listRooms({ page, limit: 15 })
      if (r.data.success) { setRooms(r.data.rooms); setTotal(r.data.total) }
    } catch {} finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const deleteRoom = async (id, title) => {
    if (!window.confirm(`Delete room "${title}"?`)) return
    setActing(id)
    try {
      await adminAPI.deleteRoom(id)
      toast.success('Room deleted.')
      load()
    } catch { toast.error('Failed.') }
    finally { setActing(null) }
  }

  const pages = Math.ceil(total / 15)

  return (
    <div>
      {loading ? <PageLoader /> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                {['Title', 'Location', 'Rent', 'Owner', 'Listed', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--txt2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rooms.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.title || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--txt2)' }}>{[r.area, r.city].filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--brand)', fontWeight: 500 }}>{r.rent ? formatCurrency(r.rent) : '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12 }}>{r.owner_id?.slice(-6)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12 }}>{formatRelativeTime(r.created_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button className="btn btn-sm" style={{ color: '#A32D2D', border: '1px solid #F09595' }}
                      onClick={() => deleteRoom(r.id, r.title)} disabled={acting === r.id}>
                      {acting === r.id ? <Spinner size={12} /> : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{total} rooms total</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
          <span style={{ fontSize: 13, lineHeight: '30px', padding: '0 8px' }}>{page} / {pages || 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: ML Model ──────────────────────────────────────────────────────────────
function ModelTab() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const retrain = async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await adminAPI.retrainModel()
      setResult(r.data)
      if (r.data.success) toast.success('Model retrained successfully!')
      else toast.error(r.data.message)
    } catch { toast.error('Retrain failed.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>ML matching engine</h2>
      <p style={{ color: 'var(--txt2)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        The engine auto-retrains on every recommendations request. Use this button to force a manual retrain, for example after bulk-updating user preferences.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Pipeline</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          {['KMeans clustering', '→', 'KNN neighbours', '→', 'Cosine similarity', '→', '0–100% score'].map((s, i) => (
            s === '→'
              ? <span key={i} style={{ color: 'var(--txt3)' }}>→</span>
              : <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99,
                  background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--txt)' }}>
                  {s}
                </span>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={retrain} disabled={loading} style={{ marginBottom: 20 }}>
        {loading ? <><Spinner size={16} /> Retraining…</> : '↺ Retrain model now'}
      </button>

      {result && (
        <div className="card" style={{ background: result.success ? '#EAF3DE' : '#FCEBEB', border: `1px solid ${result.success ? '#C0DD97' : '#F7C1C1'}` }}>
          <div style={{ fontWeight: 500, color: result.success ? '#27500A' : '#791F1F', marginBottom: 8 }}>
            {result.success ? 'Retrain successful' : 'Retrain failed'}
          </div>
          <div style={{ fontSize: 13, color: result.success ? '#3B6D11' : '#A32D2D' }}>{result.message}</div>
          {result.users_found != null && (
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 6 }}>
              Users trained on: {result.users_found} · Clusters: {result.clusters}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
