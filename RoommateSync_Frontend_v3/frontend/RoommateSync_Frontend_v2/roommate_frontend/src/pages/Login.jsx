import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/Shared'

export default function Login() {
  const { login }        = useAuth()
  const navigate         = useNavigate()
  const [form, setForm]  = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authAPI.login(form)
      if (res.data.success) {
        await login(res.data.token, res.data.user)
        toast.success('Welcome back!')
        navigate('/')
      } else {
        toast.error(res.data.message)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 42, color: '#fff', lineHeight: 1.2 }}>
            Find your<br />perfect<br />roommate.
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', marginTop: 20, fontSize: 16, maxWidth: 320, lineHeight: 1.7 }}>
            AI-powered matching, real-time chat, and verified profiles — all in one place.
          </p>
          <div style={{ display: 'flex', gap: 20, marginTop: 40 }}>
            {['92% Match accuracy', 'Verified users', 'Live chat'].map(f => (
              <div key={f} style={{ background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>{f}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form fade-up">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, marginBottom: 6 }}>Sign in</h2>
          <p style={{ color: 'var(--txt2)', fontSize: 14, marginBottom: 32 }}>
            New here? <Link to="/register" style={{ color: 'var(--brand)', fontWeight: 500 }}>Create an account</Link>
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="input-wrap">
              <label className="input-label">Email address</label>
              <input className="input" type="email" name="email" placeholder="you@example.com"
                value={form.email} onChange={handle} required />
            </div>
            <div className="input-wrap">
              <label className="input-label">Password</label>
              <input className="input" type="password" name="password" placeholder="••••••••"
                value={form.password} onChange={handle} required />
            </div>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
              {loading ? <Spinner size={18} /> : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--txt2)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--brand)', fontWeight: 500 }}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
