import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { notifAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import { formatRelativeTime } from '../utils/helpers'

const POLL_MS = 15000

/**
 * placement="topbar"  → dropdown opens downward, aligns to RIGHT edge of button
 * placement="sidebar" → dropdown opens UPWARD, aligns to LEFT edge (avoids sidebar clip)
 */
export default function NotificationBell({ placement = 'topbar' }) {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [notifs, setNotifs] = useState([])
  const [open, setOpen]     = useState(false)
  const wrapRef             = useRef(null)
  const intervalRef         = useRef(null)

  const fetchNotifs = useCallback(async () => {
    if (!user?.user_id) return
    try {
      const res = await notifAPI.getAll(user.user_id)
      if (res.data.success) setNotifs(res.data.notifications || [])
    } catch {}
  }, [user])

  useEffect(() => {
    fetchNotifs()
    intervalRef.current = setInterval(fetchNotifs, POLL_MS)
    return () => clearInterval(intervalRef.current)
  }, [fetchNotifs])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = notifs.filter(n => !n.read).length

  const handleBellClick = (e) => {
    e.stopPropagation()   // prevents bubbling to parent (e.g. sidebar profile click)
    setOpen(o => !o)
  }

  const markRead = async (n) => {
    if (!n.read) {
      await notifAPI.markRead(n.id).catch(() => {})
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.type === 'chat_request' || n.type === 'chat_accepted') {
      navigate('/chat')
      setOpen(false)
    }
  }

  const markAllRead = async (e) => {
    e.stopPropagation()
    await Promise.all(notifs.filter(n => !n.read).map(n => notifAPI.markRead(n.id).catch(() => {})))
    setNotifs(prev => prev.map(x => ({ ...x, read: true })))
  }

  const iconFor = (type) => {
    if (type === 'chat_request')  return '💬'
    if (type === 'chat_accepted') return '✅'
    return '🔔'
  }

  // Dropdown position:
  // sidebar  → open upward (bottom: 44px), left-aligned (left: 0), max 200px wide to fit sidebar
  // topbar   → open downward (top: 44px), right-aligned (right: 0), full 300px width
  const panelStyle = placement === 'sidebar'
    ? {
        position: 'absolute',
        bottom: 44, top: 'auto',
        left: 0, right: 'auto',
        width: 260,
        maxHeight: 360,
      }
    : {
        position: 'absolute',
        top: 44, bottom: 'auto',
        right: 0, left: 'auto',
        width: 300,
        maxHeight: 420,
      }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* Bell button */}
      <button
        onClick={handleBellClick}
        style={{
          position: 'relative',
          width: 36, height: 36,
          borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--bg-hover)' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: 'var(--txt2)',
          transition: 'background .15s',
          flexShrink: 0,
        }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 2a6 6 0 00-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 00-6-6Z" strokeLinejoin="round"/>
          <path d="M8 16a2 2 0 004 0" strokeLinecap="round"/>
        </svg>
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: 4, right: 4,
            width: 15, height: 15, borderRadius: '50%',
            background: 'var(--brand)', color: '#fff',
            fontSize: 8, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg-card)',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          ...panelStyle,
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-md)',
          borderRadius: 'var(--r)',
          boxShadow: '0 8px 32px rgba(0,0,0,.15)',
          zIndex: 9999,       // above everything including sidebar overlay
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px 9px',
            borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, background: 'var(--bg-card)',
          }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              Notifications{unread > 0 && <span style={{ color: 'var(--brand)', marginLeft: 4 }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifs.length === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>
              No notifications
            </div>
          ) : (
            notifs.slice(0, 20).map(n => (
              <div key={n.id} onClick={() => markRead(n)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: n.read ? 'transparent' : 'var(--brand-light)',
                  transition: 'background .15s',
                }}>
                <span style={{ fontSize: 16, lineHeight: 1, paddingTop: 1, flexShrink: 0 }}>
                  {iconFor(n.type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--txt)' }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>
                    {formatRelativeTime(n.created_at)}
                  </div>
                </div>
                {!n.read && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
