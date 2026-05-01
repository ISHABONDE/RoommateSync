import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { usersAPI, chatAPI } from '../api'
import { chatStatusAPI } from '../api/index.js'
import { useAuth } from '../context/AuthContext'
import { Avatar, CompatBar, PageLoader } from '../components/Shared'
import { formatCurrency, verificationLabel, verificationClass } from '../utils/helpers'

const SLEEP_LABELS  = ['Early bird', 'Normal', 'Night owl']
const CLEAN_LABELS  = ['Very clean', 'Clean', 'Average', 'Relaxed']
const SOCIAL_LABELS = ['Very introvert', 'Introvert', 'Balanced', 'Extrovert', 'Very extrovert']
const NOISE_LABELS  = ['Very sensitive', 'Sensitive', 'Moderate', 'Tolerant', 'Very tolerant']
const STUDY_LABELS  = ['No study', 'Light', 'Heavy']
const GUEST_LABELS  = ['Never', 'Rarely', 'Sometimes', 'Often']

export default function UserProfile() {
  const { id }     = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [requesting, setRequesting] = useState(false)

  // Chat request state — prevents duplicate requests and shows correct button
  const [chatStatus, setChatStatus] = useState('none')   // 'none' | 'pending' | 'accepted'
  const [chatRequestId, setChatRequestId] = useState(null)
  const [isSender, setIsSender]     = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        // Load profile and chat status in parallel
        const [profileRes, statusRes] = await Promise.all([
          usersAPI.getById(id),
          chatStatusAPI(id).catch(() => ({ data: { status: 'none' } })),
        ])
        if (profileRes.data.success) setProfile(profileRes.data.user)
        if (statusRes.data.success ?? true) {
          setChatStatus(statusRes.data.status || 'none')
          setChatRequestId(statusRes.data.request_id || null)
          setIsSender(statusRes.data.is_sender || false)
        }
      } catch { navigate('/') }
      finally { setLoading(false) }
    }
    load()
  }, [id])

  const sendRequest = async () => {
    setRequesting(true)
    try {
      const res = await chatAPI.sendRequest(id)
      if (res.data.success) {
        toast.success('Chat request sent!')
        setChatStatus('pending')
        setChatRequestId(res.data.request_id)
        setIsSender(true)
      } else {
        // Backend 409 returns status field
        toast.error(res.data.message)
        if (res.data.status) setChatStatus(res.data.status)
      }
    } catch (err) {
      const d = err.response?.data
      toast.error(d?.message || 'Failed to send request.')
      if (d?.status) { setChatStatus(d.status); setChatRequestId(d.request_id || null) }
    } finally { setRequesting(false) }
  }

  const goToChat = () => navigate('/chat')

  if (loading) return <PageLoader />
  if (!profile) return null

  const isOwn    = profile.user_id === user?.user_id
  const getLabel = (arr, val) => (val != null && arr[val] != null) ? arr[val] : '—'

  // Determine CTA button state
  const renderCTA = () => {
    if (isOwn) return null

    if (chatStatus === 'accepted') {
      return (
        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={goToChat}>
          💬 Open chat
        </button>
      )
    }

    if (chatStatus === 'pending') {
      if (isSender) {
        return (
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} disabled>
            ⏳ Request sent — waiting for response
          </button>
        )
      } else {
        // They sent to me — go accept in chat
        return (
          <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={goToChat}>
            💬 Respond to their request
          </button>
        )
      }
    }

    // No request yet
    return (
      <button className="btn btn-primary btn-lg" style={{ flex: 1 }}
        onClick={sendRequest} disabled={requesting}>
        {requesting ? 'Sending…' : '💬 Send chat request'}
      </button>
    )
  }

  return (
    <div>
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="page-body" style={{ maxWidth: 700 }}>

        {/* Hero card */}
        <div className="card fade-up fade-up-1" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Avatar name={profile.name} src={profile.profile_image || ''} size={80} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 24, marginBottom: 4 }}>{profile.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {profile.city && (
                  <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
                    📍 {[profile.area, profile.city].filter(Boolean).join(', ')}
                  </span>
                )}
                <span className={`badge ${verificationClass(profile.verification_status)}`}>
                  {verificationLabel(profile.verification_status)}
                </span>
              </div>
              {profile.room_rent && (
                <div style={{ marginTop: 6, fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--brand)' }}>
                  {formatCurrency(profile.room_rent)}
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--txt2)' }}>/mo budget</span>
                </div>
              )}
            </div>

            {/* Action buttons — top right on desktop */}
            {!isOwn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
                {renderCTA()}
              </div>
            )}
          </div>
        </div>

        {/* Lifestyle preferences */}
        <div className="card fade-up fade-up-2" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>Lifestyle</h3>
          <div className="grid-2" style={{ gap: 12 }}>
            {[
              ['Sleep schedule',  getLabel(SLEEP_LABELS,  profile.sleep_time)],
              ['Cleanliness',     getLabel(CLEAN_LABELS,  profile.cleanliness)],
              ['Social level',    getLabel(SOCIAL_LABELS, profile.social_level)],
              ['Noise tolerance', getLabel(NOISE_LABELS,  profile.noise_tolerance)],
              ['Study habit',     getLabel(STUDY_LABELS,  profile.study_habit)],
              ['Guests',          getLabel(GUEST_LABELS,  profile.guest_frequency)],
              ['Smoking',         profile.smoking ? 'Yes' : 'No'],
              ['Alcohol',         profile.Alcohol ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Room situation */}
        {(profile.room_status != null || profile.roommates_needed) && (
          <div className="card fade-up fade-up-3" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, marginBottom: 16 }}>Room situation</h3>
            <div className="grid-2" style={{ gap: 12 }}>
              {profile.room_status != null && (
                <div style={{ padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Status</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                    {['—', 'Has a room', 'Looking together', 'Needs to join'][profile.room_status] ?? '—'}
                  </div>
                </div>
              )}
              {profile.roommates_needed && (
                <div style={{ padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Roommates needed</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{profile.roommates_needed}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom CTA (mobile / full-width) */}
        {!isOwn && (
          <div className="fade-up fade-up-4" style={{ display: 'flex', gap: 10 }}>
            {renderCTA()}
          </div>
        )}
      </div>
    </div>
  )
}
