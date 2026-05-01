import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { recommendAPI, chatAPI } from '../api'
import { chatStatusAPI } from '../api/index.js'
import { Avatar, Spinner, EmptyState } from '../components/Shared'
import { scoreColor, scoreBg, formatCurrency } from '../utils/helpers'
import toast from 'react-hot-toast'

const LIMIT_OPTIONS = [
  { label: 'Top 5',  value: 5  },
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'All',    value: 9999 },
]
const SCORE_FILTERS = [
  { label: 'All scores', min: 0  },
  { label: '90%+',       min: 90 },
  { label: '80%+',       min: 80 },
  { label: '70%+',       min: 70 },
]
const SORT_OPTIONS = [
  { label: 'Best match', key: 'score'  },
  { label: 'Name A–Z',   key: 'name'   },
  { label: 'Lowest budget', key: 'rent' },
]
const SLEEP_LABELS = ['Early bird', 'Normal', 'Night owl']

export default function Matches() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  // allMatches = raw from API (already has profile_image, room_rent, etc.)
  const [allMatches, setAllMatches] = useState([])
  // chatStatuses = { user_id: { status, request_id, is_sender } }
  const [chatStatuses, setChatStatuses] = useState({})
  const [loading, setLoading]     = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')
  const [sendingId, setSendingId] = useState(null)

  const [limit,    setLimit]    = useState(10)
  const [minScore, setMinScore] = useState(0)
  const [sortKey,  setSortKey]  = useState('score')

  // ── Fetch matches ──────────────────────────────────────────────────────────
  const fetchMatches = useCallback(async () => {
    if (!user?.user_id) return
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await recommendAPI.getMatches(user.user_id)
      if (res.data.success) {
        const matches = res.data.matches || []
        setAllMatches(matches)
        // Batch-fetch chat statuses
        fetchChatStatuses(matches)
      } else {
        setErrorMsg(res.data.message || 'Could not load matches.')
      }
    } catch {
      setErrorMsg('Failed to reach the matching engine.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchMatches() }, [fetchMatches])

  // ── Fetch chat statuses in parallel ───────────────────────────────────────
  const fetchChatStatuses = async (matches) => {
    if (!matches.length) return
    setLoadingChat(true)
    const results = await Promise.allSettled(
      matches.map(m =>
        chatStatusAPI(m.user_id)
          .then(r => [m.user_id, r.data])
          .catch(() => [m.user_id, { status: 'none', request_id: null, is_sender: false }])
      )
    )
    const map = {}
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        const [uid, data] = r.value
        map[uid] = data
      }
    })
    setChatStatuses(map)
    setLoadingChat(false)
  }

  // ── Apply filters ──────────────────────────────────────────────────────────
  const displayed = (() => {
    let list = allMatches.filter(m => m.compatibility_score >= minScore)
    if (sortKey === 'score') list = [...list].sort((a, b) => b.compatibility_score - a.compatibility_score)
    else if (sortKey === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortKey === 'rent') list = [...list].sort((a, b) => (a.room_rent || 0) - (b.room_rent || 0))
    return limit >= 9999 ? list : list.slice(0, limit)
  })()

  // ── Send chat request ──────────────────────────────────────────────────────
  const sendRequest = async (e, match) => {
    e.stopPropagation()
    setSendingId(match.user_id)
    try {
      const res = await chatAPI.sendRequest(match.user_id)
      if (res.data.success) {
        toast.success(`Request sent to ${match.name}!`)
        setChatStatuses(prev => ({
          ...prev,
          [match.user_id]: { status: 'pending', request_id: res.data.request_id, is_sender: true },
        }))
      } else {
        toast.error(res.data.message)
        if (res.data.status) {
          setChatStatuses(prev => ({ ...prev, [match.user_id]: { status: res.data.status } }))
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send request.')
    } finally {
      setSendingId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>Matches</h1><p>AI-powered compatibility</p></div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'40vh', gap:16 }}>
          <Spinner size={36} />
          <p style={{ color:'var(--txt2)', fontSize:14, textAlign:'center', maxWidth:300 }}>
            Training AI model and computing compatibility scores…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <h1>Matches</h1>
            <p>
              {allMatches.length > 0
                ? `${allMatches.length} compatibility matches found by AI`
                : 'AI compatibility recommendations'}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchMatches}>↺ Refresh</button>
        </div>

        {/* Filters */}
        <div style={{ marginTop:20, display:'flex', flexWrap:'wrap', gap:16, alignItems:'center' }}>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--txt2)', whiteSpace:'nowrap' }}>Show:</span>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {LIMIT_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setLimit(o.value)}
                  className={`btn btn-sm ${limit === o.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize:12, padding:'5px 12px' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--txt2)', whiteSpace:'nowrap' }}>Score:</span>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {SCORE_FILTERS.map(o => (
                <button key={o.min} onClick={() => setMinScore(o.min)}
                  className={`btn btn-sm ${minScore === o.min ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize:12, padding:'5px 12px' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--txt2)', whiteSpace:'nowrap' }}>Sort:</span>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}
              style={{ fontSize:12, padding:'5px 10px', border:'1px solid var(--border-md)',
                borderRadius:'var(--r-sm)', background:'var(--bg-card)', color:'var(--txt)', cursor:'pointer' }}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop:10, fontSize:12, color:'var(--txt3)', display:'flex', alignItems:'center', gap:10 }}>
          <span>Showing {displayed.length} of {allMatches.length} matches</span>
          {loadingChat && <span style={{ color:'var(--brand)' }}>Loading chat status…</span>}
        </div>
      </div>

      {/* ── Cards ───────────────────────────────────────────────────── */}
      <div className="page-body">

        {/* Error state */}
        {errorMsg && (
          <div style={{ background:'var(--bg-hover)', border:'1px solid var(--border)', borderRadius:'var(--r)',
            padding:'20px 24px', marginBottom:24 }}>
            <div style={{ fontWeight:500, marginBottom:6 }}>Could not load matches</div>
            <div style={{ fontSize:13, color:'var(--txt2)', marginBottom:12 }}>{errorMsg}</div>
            <div style={{ fontSize:12, color:'var(--txt3)' }}>
              To get matches: fill in your preferences in{' '}
              <button onClick={() => navigate('/profile?tab=Preferences')}
                style={{ color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontSize:12 }}>
                Profile → Preferences
              </button>{' '}
              and make sure at least 2 users have preferences saved.
            </div>
          </div>
        )}

        {!errorMsg && displayed.length === 0 ? (
          <EmptyState icon="🤝" title="No matches found"
            subtitle={allMatches.length === 0
              ? "Fill in your preferences so the AI can find compatible roommates."
              : "Try lowering the score filter or showing more results."}
            action={allMatches.length === 0
              ? <button className="btn btn-primary" onClick={() => navigate('/profile?tab=Preferences')}>Fill preferences</button>
              : <button className="btn btn-ghost" onClick={() => { setMinScore(0); setLimit(9999) }}>Reset filters</button>}
          />
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
            {displayed.map((m, idx) => {
              const cs = chatStatuses[m.user_id] || { status: 'none' }
              return (
                <MatchCard key={m.user_id} match={m} rank={idx+1}
                  chatStatus={cs.status} isSender={cs.is_sender}
                  sleepLabel={SLEEP_LABELS[m.sleep_time] ?? null}
                  sending={sendingId === m.user_id}
                  onCardClick={() => navigate(`/user/${m.user_id}`)}
                  onSendRequest={e => sendRequest(e, m)}
                  onOpenChat={e => { e.stopPropagation(); navigate('/chat') }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Score ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 28, circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  return (
    <div style={{ position:'relative', width:72, height:72, flexShrink:0 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth="5"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition:'stroke-dasharray .8s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:15, fontWeight:600, color:scoreColor(score), lineHeight:1 }}>{score}%</span>
        <span style={{ fontSize:8, color:'var(--txt3)', marginTop:1 }}>match</span>
      </div>
    </div>
  )
}

// ── Match card ─────────────────────────────────────────────────────────────────
function MatchCard({ match, rank, chatStatus, isSender, sleepLabel, sending, onCardClick, onSendRequest, onOpenChat }) {
  const score = match.compatibility_score
  const ver   = match.verification_status

  return (
    <div onClick={onCardClick}
      style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--r)',
        overflow:'hidden', cursor:'pointer', transition:'transform .15s, box-shadow .15s, border-color .15s',
        position:'relative' }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(28,25,23,.10)'; e.currentTarget.style.borderColor='var(--border-md)' }}
      onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--border)' }}
    >
      {/* Rank badge */}
      <div style={{ position:'absolute', top:12, left:12, width:24, height:24, borderRadius:'50%',
        background: rank <= 3 ? 'var(--brand)' : 'var(--bg-hover)',
        color: rank <= 3 ? '#fff' : 'var(--txt2)',
        fontSize:11, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center',
        border:'2px solid var(--bg-card)', zIndex:1 }}>
        #{rank}
      </div>

      {/* Banner */}
      <div style={{ height:90, background:`linear-gradient(135deg, ${scoreBg(score)} 0%, var(--brand-light) 100%)`,
        position:'relative', overflow:'hidden' }}>
        {match.profile_image && (
          <img src={match.profile_image} alt={match.name}
            style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.35 }} />
        )}
        <div style={{ position:'absolute', right:14, bottom:-20 }}>
          <ScoreRing score={score} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding:'28px 16px 16px' }}>

        {/* Avatar + name */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:12, marginBottom:12 }}>
          <Avatar name={match.name} src={match.profile_image} size={52}
            style={{ border:'3px solid var(--bg-card)', flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:17, fontWeight:500,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {match.name || 'Anonymous'}
            </div>
            <div style={{ fontSize:12, color:'var(--txt2)', marginTop:2 }}>
              {[match.area, match.city].filter(Boolean).join(', ') || 'Location not set'}
            </div>
          </div>
          {ver === 2 && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:99, background:'#EAF3DE', color:'#3B6D11', fontWeight:500, flexShrink:0 }}>Verified</span>}
          {ver === 1 && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:99, background:'#E6F1FB', color:'#185FA5', fontWeight:500, flexShrink:0 }}>Pending</span>}
        </div>

        {/* Compat bar */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:11, color:'var(--txt2)' }}>Compatibility score</span>
            <span style={{ fontSize:11, fontWeight:600, color:scoreColor(score) }}>{score}%</span>
          </div>
          <div style={{ height:5, background:'var(--bg-hover)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:3, background:scoreColor(score),
              width:`${score}%`, transition:'width .8s cubic-bezier(.22,1,.36,1)' }} />
          </div>
        </div>

        {/* Tags */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {match.room_rent && (
            <span style={{ fontSize:11, padding:'3px 8px', borderRadius:99, background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--txt2)' }}>
              {formatCurrency(match.room_rent)}/mo
            </span>
          )}
          {sleepLabel && (
            <span style={{ fontSize:11, padding:'3px 8px', borderRadius:99, background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--txt2)' }}>
              {sleepLabel}
            </span>
          )}
          {match.smoking === 0 && (
            <span style={{ fontSize:11, padding:'3px 8px', borderRadius:99, background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--txt2)' }}>
              Non-smoker
            </span>
          )}
        </div>

        {/* CTA buttons */}
        <div style={{ display:'flex', gap:8 }} onClick={e => e.stopPropagation()}>
          {chatStatus === 'accepted' ? (
            <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={onOpenChat}>💬 Open chat</button>
          ) : chatStatus === 'pending' ? (
            <button className="btn btn-ghost btn-sm" style={{ flex:1 }} disabled>
              {isSender ? '⏳ Request sent' : '💬 Respond in chat'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" style={{ flex:1 }}
              onClick={onSendRequest} disabled={sending}>
              {sending ? <Spinner size={14} /> : '💬 Send request'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ flex:1 }}
            onClick={e => { e.stopPropagation(); onCardClick() }}>
            View profile →
          </button>
        </div>
      </div>
    </div>
  )
}
