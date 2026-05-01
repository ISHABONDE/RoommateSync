import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE,
  timeout: 15000,
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rs_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const publicPaths = ['/login', '/register', '/verify-otp']
      const isPublic = publicPaths.some(p => window.location.pathname.startsWith(p))
      if (!isPublic) {
        localStorage.removeItem('rs_token')
        localStorage.removeItem('rs_user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
