import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getInitials, getAvatarColor, scoreColor, scoreBg } from '../utils/helpers'

// ── Avatar ───────────────────────────────────────────────────────────────────
// Resolve a stored image path to a full URL.
// Paths are stored as "/uploads/profiles/abc.jpg" (URL-safe, starts with /).
// In dev Vite proxies /uploads → backend. In prod we prepend VITE_API_URL.
function resolveImageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path          // already absolute
  const base = import.meta.env.VITE_API_URL || ''
  return `${base}${path}`                            // e.g. http://localhost:5000/uploads/profiles/abc.jpg
}

export function Avatar({ name = '', src, size = 44, className = '' }) {
  const { bg, fg } = getAvatarColor(name)
  const initials   = getInitials(name)
  const imgUrl     = resolveImageUrl(src)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      className={`avatar ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.32 }}
    >
      {imgUrl && !imgError
        ? <img src={imgUrl} alt={name} onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : initials}
    </div>
  )
}

// ── Compat bar ────────────────────────────────────────────────────────────────
export function CompatBar({ score = 0, showLabel = true }) {
  return (
    <div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--txt2)' }}>Compatibility</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: scoreColor(score) }}>{score}%</span>
        </div>
      )}
      <div className="compat-bar-track">
        <div className="compat-bar-fill" style={{ width: `${score}%`, background: scoreColor(score) }} />
      </div>
    </div>
  )
}

// ── Score pill ────────────────────────────────────────────────────────────────
export function ScorePill({ score }) {
  return (
    <span className="badge" style={{ background: scoreBg(score), color: scoreColor(score) }}>
      {score}%
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />
}

export function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Spinner size={32} />
    </div>
  )
}

// ── Protected route ───────────────────────────────────────────────────────────
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user)   return <Navigate to="/login" replace />
  return children
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--txt2)', fontSize: 14, marginBottom: action ? 20 : 0 }}>{subtitle}</p>
      {action}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>
}
