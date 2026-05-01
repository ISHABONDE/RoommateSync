import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { chatAPI, usersAPI } from '../api'
import { Avatar, PageLoader, EmptyState } from '../components/Shared'
import { formatRelativeTime } from '../utils/helpers'
import toast from 'react-hot-toast'

export default function Chat() {
  const { user }   = useAuth()
  const socket     = useSocket()

  const [requests, setRequests]         = useState([])
  const [activeChat, setActiveChat]     = useState(null)
  const [messages, setMessages]         = useState([])
  const [text, setText]                 = useState('')
  const [loading, setLoading]           = useState(true)
  const [sending, setSending]           = useState(false)
  const [typing, setTyping]             = useState(false)
  const [participants, setParticipants] = useState({})

  const endRef    = useRef(null)
  const typingRef = useRef(null)
  // Track which WS rooms we have already joined to avoid duplicate join_room emits
  const joinedRooms = useRef(new Set())

  useEffect(() => { if (user) loadRequests() }, [user])

  const loadRequests = async () => {
    setLoading(true)
    try {
      // FIXED: backend now returns ALL requests (sent OR received) via $or query
      const res = await chatAPI.getInbox(user.user_id)
      if (!res.data.success) return

      const reqs = res.data.requests || []
      setRequests(reqs)

      // Pre-fetch participant names for all other users
      const otherIds = [...new Set(
        reqs.map(r => r.from_user_id === user.user_id ? r.to_user_id : r.from_user_id)
            .filter(Boolean)
      )]
      const entries = await Promise.all(
        otherIds.map(id =>
          usersAPI.getById(id)
            .then(r => [id, r.data.user])
            .catch(() => [id, null])
        )
      )
      setParticipants(Object.fromEntries(entries.filter(([, u]) => u)))
    } catch (err) {
      console.error('loadRequests error:', err)
    } finally {
      setLoading(false)
    }
  }

  // AUTO-JOIN all accepted WS rooms as soon as we have the list + socket connected
  // This is the critical fix: User A (sender) needs to be in the room BEFORE
  // User B sends a message, otherwise they miss it entirely.
  useEffect(() => {
    if (!socket?.connected) return
    const accepted = requests.filter(r => r.status === 'accepted')
    accepted.forEach(req => {
      if (!joinedRooms.current.has(req.id)) {
        socket.joinRoom(req.id)
        joinedRooms.current.add(req.id)
      }
    })
  }, [socket?.connected, requests])

  const openChat = useCallback(async (req) => {
    setActiveChat(req)
    setMessages([])
    try {
      const res = await chatAPI.getMessages(req.id)
      if (res.data.success) setMessages(res.data.messages || [])
    } catch {}
    // Join room if not already joined (defensive)
    if (!joinedRooms.current.has(req.id)) {
      socket?.joinRoom(req.id)
      joinedRooms.current.add(req.id)
    }
  }, [socket])

  // Listen for incoming WS messages across ALL rooms we have joined
  useEffect(() => {
    if (!socket) return
    const unsub = socket.onMessage((data) => {
      setMessages(prev => {
        // Only add to display if it belongs to the currently open chat
        // The message is already saved to MongoDB — we just update UI
        if (data.room_id !== activeChat?.id) return prev

        // Remove matching optimistic message to avoid duplication
        const filtered = prev.filter(m =>
          !(m.id?.startsWith('temp-') && m.message === data.message && m.sender_id === data.sender_id)
        )
        // Avoid adding duplicates (e.g. if REST and WS both fire)
        if (filtered.some(m => m.id === data.message_id)) return filtered

        return [...filtered, {
          id:        data.message_id,
          sender_id: data.sender_id,
          message:   data.message,
          sent_at:   data.sent_at,
        }]
      })
    })
    return unsub
  }, [socket, activeChat])

  // Typing indicator
  useEffect(() => {
    if (!socket) return
    const unsub = socket.onTyping((data) => {
      if (data.room_id === activeChat?.id && data.user_id !== user?.user_id) {
        setTyping(data.is_typing)
        clearTimeout(typingRef.current)
        typingRef.current = setTimeout(() => setTyping(false), 3000)
      }
    })
    return unsub
  }, [socket, activeChat, user])

  // Scroll to bottom when messages update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const handleTyping = (e) => {
    setText(e.target.value)
    if (activeChat) socket?.sendTyping(activeChat.id, true)
  }

  const sendMsg = async () => {
    if (!text.trim() || !activeChat) return
    const msg = text.trim()
    setText('')
    setSending(true)

    // Optimistic message shown immediately
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, sender_id: user.user_id,
      message: msg, sent_at: new Date().toISOString(),
    }])

    try {
      if (socket?.connected) {
        // WS path — server broadcasts back via receive_message event
        socket.sendMessage(activeChat.id, msg)
      } else {
        // REST fallback when WS offline — keeps temp message (no broadcast needed)
        await chatAPI.sendMessage(activeChat.id, msg)
      }
    } catch {
      toast.error('Failed to send message.')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() }
  }

  const acceptRequest = async (req) => {
    try {
      const res = await chatAPI.acceptRequest(req.id)
      if (res.data.success) {
        toast.success('Chat request accepted!')
        await loadRequests()
        // Immediately open the chat
        openChat({ ...req, status: 'accepted' })
      }
    } catch { toast.error('Failed to accept request.') }
  }

  const rejectRequest = async (req) => {
    try {
      await chatAPI.rejectRequest(req.id)
      setRequests(prev => prev.filter(r => r.id !== req.id))
    } catch {}
  }

  // Returns the other participant's user profile
  const getOther = (req) => {
    const otherId = req.from_user_id === user?.user_id ? req.to_user_id : req.from_user_id
    return participants[otherId]
  }

  const accepted = requests.filter(r => r.status === 'accepted')
  // Pending requests sent TO me (I need to accept/reject)
  const pending  = requests.filter(r => r.status === 'pending' && r.to_user_id === user?.user_id)

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1>Chat</h1>
            <p>Real-time messaging with your matches</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: socket?.connected ? '#3B6D11' : 'var(--txt3)' }} />
            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
              {socket?.connected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      <div className="chat-layout" style={{ height: 'calc(100vh - 121px)' }}>

        {/* ── Left panel ────────────────────────────────────────────────── */}
        <div className="chat-list">

          {/* Pending requests I need to respond to */}
          {pending.length > 0 && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--brand-light)' }}>
              <div className="section-label" style={{ marginBottom: 10, color: 'var(--brand)' }}>
                {pending.length} pending request{pending.length > 1 ? 's' : ''}
              </div>
              {pending.map(req => {
                const other = getOther(req)
                return (
                  <div key={req.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Avatar name={other?.name || '?'} src={other?.profile_image || ''} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {other?.name || `User …${req.from_user_id?.slice(-4)}`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                        {formatRelativeTime(req.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => acceptRequest(req)}>Accept</button>
                      <button className="btn btn-ghost btn-sm"   onClick={() => rejectRequest(req)}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Accepted conversation list */}
          {loading ? (
            <div style={{ padding: 20 }}><PageLoader /></div>
          ) : accepted.length === 0 ? (
            <EmptyState icon="💬" title="No conversations yet"
              subtitle="Send a chat request from any roommate profile to start." />
          ) : (
            accepted.map(req => {
              const other    = getOther(req)
              const isActive = activeChat?.id === req.id
              return (
                <div key={req.id} onClick={() => openChat(req)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', cursor: 'pointer',
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isActive ? '3px solid var(--brand)' : '3px solid transparent',
                    transition: 'all .15s',
                  }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar name={other?.name || '?'} src={other?.profile_image || ''} size={42} />
                    {socket?.connected && (
                      <div style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#3B6D11', border: '2px solid var(--bg-card)',
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {other?.name || `User …${(req.from_user_id === user?.user_id ? req.to_user_id : req.from_user_id)?.slice(-4)}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
                      {req.from_user_id === user?.user_id ? 'You sent a request' : 'Sent you a request'}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Chat window ───────────────────────────────────────────────── */}
        {activeChat ? (
          <div className="chat-window">
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={getOther(activeChat)?.name || '?'} src={getOther(activeChat)?.profile_image || ''} size={38} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {getOther(activeChat)?.name || 'User'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: socket?.connected ? '#3B6D11' : 'var(--txt3)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: socket?.connected ? '#3B6D11' : 'var(--txt3)' }} />
                  {socket?.connected ? 'Online — real-time' : 'Offline — using saved messages'}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--txt3)', fontSize: 13, marginTop: 60 }}>
                  No messages yet — say hello! 👋
                </div>
              )}
              {messages.map(m => {
                const isMe = m.sender_id === user?.user_id
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div
                      className={`msg-bubble ${isMe ? 'me' : 'them'}`}
                      style={{ opacity: m.id?.startsWith('temp-') ? 0.6 : 1 }}>
                      {m.message}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3, marginLeft: isMe ? 0 : 4, marginRight: isMe ? 4 : 0 }}>
                      {m.id?.startsWith('temp-') ? 'Sending…' : formatRelativeTime(m.sent_at)}
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {typing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: 'var(--txt3)',
                        animation: `typingBounce .8s ${i * .15}s infinite alternate`,
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--txt3)' }}>typing…</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input bar */}
            <div className="chat-input-bar">
              <input
                value={text} onChange={handleTyping} onKeyDown={handleKeyDown}
                placeholder="Type a message…" disabled={sending}
              />
              <button
                className="btn btn-primary"
                onClick={sendMsg} disabled={!text.trim() || sending}
                style={{ padding: '10px 18px', borderRadius: 99 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8L14 2L10 8L14 14L2 8Z" fill="white"/>
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-window" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon="💬" title="Select a conversation"
              subtitle="Click any conversation on the left to open it." />
          </div>
        )}
      </div>

      <style>{`
        @keyframes typingBounce {
          from { transform: translateY(0); }
          to   { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  )
}
