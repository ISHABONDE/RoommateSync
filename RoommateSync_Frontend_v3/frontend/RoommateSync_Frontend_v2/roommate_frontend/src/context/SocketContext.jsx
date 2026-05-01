import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || ''

export function SocketProvider({ token, children }) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!token) return

    socketRef.current = io(SOCKET_URL, {
      query: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    socketRef.current.on('connect',    () => setConnected(true))
    socketRef.current.on('disconnect', () => setConnected(false))

    return () => {
      socketRef.current?.disconnect()
    }
  }, [token])

  const joinRoom = (roomId) => {
    socketRef.current?.emit('join_room', { room_id: roomId })
  }

  const sendMessage = (roomId, message) => {
    socketRef.current?.emit('send_message', { room_id: roomId, message })
  }

  const onMessage = (cb) => {
    socketRef.current?.on('receive_message', cb)
    return () => socketRef.current?.off('receive_message', cb)
  }

  const sendTyping = (roomId, isTyping) => {
    socketRef.current?.emit('typing', { room_id: roomId, is_typing: isTyping })
  }

  const onTyping = (cb) => {
    socketRef.current?.on('typing', cb)
    return () => socketRef.current?.off('typing', cb)
  }

  return (
    <SocketContext.Provider value={{ connected, joinRoom, sendMessage, onMessage, sendTyping, onTyping }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
