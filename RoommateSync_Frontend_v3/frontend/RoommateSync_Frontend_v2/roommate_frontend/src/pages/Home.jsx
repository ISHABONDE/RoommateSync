import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { recommendAPI, chatAPI } from '../api'
import { Avatar, ScorePill, CompatBar, PageLoader, EmptyState } from '../components/Shared'
import { formatCurrency } from '../utils/helpers'

export default function Home() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [matches, setMatches]   = useState([])
  const [requests, setRequests] = useState([])
  const [senderProfiles, setSenderProfiles] = useState({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      recommendAPI.getMatches(user.user_id),
      chatAPI.getInbox(user.user_id),
    ]).then(async ([mRes, rRes]) => {
      if (mRes.data.success) setMatches(mRes.data.matches || [])
      if (rRes.data.success) {
        const reqs = rRes.data.requests || []
        setRequests(reqs)
        // Enrich pending request senders with their profile
        const senderIds = [...new Set(
          reqs.filter(r => r.status === 'pending' && r.to_user_id === user.user_id)
              .map(r => r.from_user_id)
        )]
        if (senderIds.length > 0) {
          const { usersAPI } = await import('../api')
          const profiles = await Promise.allSettled(senderIds.map(id => usersAPI.getById(id)))
          const map = {}
          profiles.forEach((p, i) => {
            if (p.status === 'fulfilled' && p.value.data.success)
              map[senderIds[i]] = p.value.data.user
          })
          setSenderProfiles(map)
        }
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  if (loading) return <PageLoader />

  const pendingRequests = requests.filter(r => r.status === 'pending')

  return (
    <div>
      <div className="page-header">
        <h1>Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
        <p>Here's what's happening with your roommate search</p>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="grid-4 fade-up fade-up-1" style={{ marginBottom: 32 }}>
          <div className="stat-card">
            <div className="stat-num">{matches.length}</div>
            <div className="stat-lbl">AI matches found</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{matches[0]?.compatibility_score ?? '—'}%</div>
            <div className="stat-lbl">Best match score</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{pendingRequests.length}</div>
            <div className="stat-lbl">Pending requests</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{user?.preferred_distance ?? 5}km</div>
            <div className="stat-lbl">Search radius</div>
          </div>
        </div>

        {/* Profile completion nudge */}
        {!user?.latitude && (
          <div className="fade-up fade-up-2" style={{ background: 'var(--brand-light)', border: '1px solid rgba(196,96,26,.2)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--brand)', marginBottom: 3 }}>Complete your profile</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Add your location to get geospatial matches and see nearby rooms on the map.</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => navigate('/profile?tab=preferences')}>
              Update
            </button>
          </div>
        )}

        {/* Top matches */}
        <div className="fade-up fade-up-3">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20 }}>Your top matches</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/discover')}>See all →</button>
          </div>

          {matches.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No matches yet"
              subtitle="Fill in your lifestyle preferences to get AI-powered roommate matches."
              action={<button className="btn btn-primary" onClick={() => navigate('/profile')}>Update preferences</button>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {matches.slice(0, 6).map(m => (
                <MatchRow key={m.user_id} match={m} onClick={() => navigate(`/user/${m.user_id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* Pending chat requests */}
        {pendingRequests.length > 0 && (
          <div className="fade-up fade-up-4" style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Chat requests</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingRequests.slice(0, 3).map(r => (
                <div key={r.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar
                      name={senderProfiles[r.from_user_id]?.name || 'User'}
                      src={senderProfiles[r.from_user_id]?.profile_image || ''}
                      size={36}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {senderProfiles[r.from_user_id]?.name || 'New chat request'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Wants to chat with you</div>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/chat')}>View</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MatchRow({ match, onClick }) {
  return (
    <div className="match-card" onClick={onClick}>
      <Avatar name={match.name} src={match.profile_image || ''} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>{match.name || 'Anonymous'}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
          {match.city || 'Unknown city'}
          {match.city ? ` · ${match.city}` : ''}
        </div>
        <div style={{ marginTop: 8 }}>
          <CompatBar score={match.compatibility_score} />
        </div>
      </div>
      <ScorePill score={match.compatibility_score} />
    </div>
  )
}
