import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [token,   setToken]   = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount: restore token, then fetch full profile so profile_image is always available
  useEffect(() => {
    const savedToken = localStorage.getItem('rs_token')
    if (!savedToken) { setLoading(false); return }

    setToken(savedToken)
    // Fetch full profile from /auth/me (includes profile_image, all fields)
    authAPI.me()
      .then(res => {
        if (res.data.success) {
          const u = res.data.user
          setUser(u)
          localStorage.setItem('rs_user', JSON.stringify(u))
        } else {
          // Token invalid — clear session
          localStorage.removeItem('rs_token')
          localStorage.removeItem('rs_user')
          setToken(null)
        }
      })
      .catch(() => {
        // Network error: use cached user if available so app still works offline
        const savedUser = localStorage.getItem('rs_user')
        if (savedUser) setUser(JSON.parse(savedUser))
        else { localStorage.removeItem('rs_token'); setToken(null) }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (tokenVal, minimalUser) => {
    // Save token + minimal user immediately — this ensures ProtectedLayout
    // sees a non-null user before the async /auth/me call completes,
    // preventing the double-login redirect bug.
    localStorage.setItem('rs_token', tokenVal)
    localStorage.setItem('rs_user', JSON.stringify(minimalUser))
    setToken(tokenVal)
    setUser(minimalUser)

    // Then upgrade to full profile in the background
    try {
      const res = await authAPI.me()
      if (res.data.success) {
        const fullUser = res.data.user
        localStorage.setItem('rs_user', JSON.stringify(fullUser))
        setUser(fullUser)
        return fullUser
      }
    } catch {}
    return minimalUser
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('rs_token')
    localStorage.removeItem('rs_user')
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.me()
      if (res.data.success) {
        const u = res.data.user
        setUser(u)
        localStorage.setItem('rs_user', JSON.stringify(u))
        return u
      }
    } catch { logout() }
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
