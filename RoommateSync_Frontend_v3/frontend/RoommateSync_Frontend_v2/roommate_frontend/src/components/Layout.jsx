import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Shared'
import { useSocket } from '../context/SocketContext'
import NotificationBell from './NotificationBell'

const NAV = [
  { to: '/',         label: 'Home',     icon: HomeIcon },
  { to: '/matches',  label: 'Matches',  icon: MatchesIcon },
  { to: '/discover', label: 'Discover', icon: DiscoverIcon },
  { to: '/rooms',    label: 'Rooms',    icon: RoomsIcon },
  { to: '/chat',     label: 'Chat',     icon: ChatIcon },
  { to: '/profile',  label: 'Profile',  icon: ProfileIcon },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const socket           = useSocket()

  return (
    <div className="app-shell">

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div style={{ padding: '24px 20px 16px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: 'var(--brand)', fontWeight: 600 }}>
            RoommateSync
          </h1>
          <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>Find your people</p>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 16px 12px' }} />

        <nav style={{ flex: 1, overflow: 'hidden' }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {({ isActive }) => (
                <div className={`nav-item ${isActive ? 'active' : ''}`}>
                  <Icon />
                  <span>{label}</span>
                  {/* Subtle "AI" pill on Matches */}
                  {to === '/matches' && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 9, fontWeight: 600,
                      padding: '2px 6px', borderRadius: 99,
                      background: isActive ? 'rgba(196,96,26,.2)' : 'var(--brand-light)',
                      color: 'var(--brand)',
                    }}>AI</span>
                  )}
                </div>
              )}
            </NavLink>
          ))}
          {user?.is_admin && (
            <NavLink to="/admin">
              {({ isActive }) => (
                <div className={`nav-item ${isActive ? 'active' : ''}`} style={{ marginTop: 4 }}>
                  <AdminIcon />
                  <span>Admin</span>
                  <span style={{ marginLeft:'auto', fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:99,
                    background:'#FAEEDA', color:'#633806' }}>Admin</span>
                </div>
              )}
            </NavLink>
          )}
        </nav>

        {/* Sidebar footer */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)', overflow: 'visible' }}>
          {socket && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, paddingLeft: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%',
                background: socket.connected ? '#3B6D11' : 'var(--txt3)' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                {socket.connected ? 'Live chat on' : 'Connecting…'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer', padding: '4px' }}
              onClick={() => navigate('/profile')}>
              <Avatar name={user?.name} src={user?.profile_image || ''} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>
            </div>
            <NotificationBell placement="sidebar" />
          </div>

          <button className="btn btn-ghost btn-block btn-sm" onClick={logout}>Sign out</button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="main-content">
        <div className="mobile-topbar">
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--brand)', fontWeight: 600 }}>
            RoommateSync
          </span>
          <NotificationBell placement="topbar" />
        </div>
        {children}
      </main>

      {/* ── Bottom nav (mobile) ─────────────────────────────────────── */}
      <nav className="bottom-nav">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} style={{ flex: 1, display: 'contents' }}>
            {({ isActive }) => (
              <button className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
                <Icon />
                {label}
              </button>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function HomeIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M3 9.5L10 3l7 6.5V17H13v-4H7v4H3V9.5Z"/></svg>
}
function MatchesIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="8" r="3"/><circle cx="13" cy="8" r="3"/><path d="M1 17c0-2.761 2.686-5 6-5 1.007 0 1.955.238 2.764.651M11 17c0-2.761 2.686-5 6-5" strokeLinecap="round"/></svg>
}
function DiscoverIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/></svg>
}
function RoomsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><rect x="3" y="8" width="14" height="9" rx="1"/><path d="M1 8.5L10 3l9 5.5" strokeLinecap="round"/></svg>
}
function ChatIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M3 4h14a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 2V5a1 1 0 011-1Z"/></svg>
}
function ProfileIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10" cy="7" r="3.5"/><path d="M3.5 17c0-3.314 2.91-6 6.5-6s6.5 2.686 6.5 6" strokeLinecap="round"/></svg>
}
function AdminIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>
}
