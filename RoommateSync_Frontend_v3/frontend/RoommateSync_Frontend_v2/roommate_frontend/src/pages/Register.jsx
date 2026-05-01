import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../api'
import { Spinner } from '../components/Shared'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const res = await authAPI.register(form)
      if (res.data.success) {
        toast.success('Account created! Check your email for the OTP.')
        navigate('/verify-otp', { state: { email: form.email } })
      } else {
        toast.error(res.data.message)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 42, color: '#fff', lineHeight: 1.2 }}>
            Start your<br />search today.
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', marginTop: 20, fontSize: 16, maxWidth: 320, lineHeight: 1.7 }}>
            Join thousands of people who found their perfect living situation with RoommateSync.
          </p>
          <div style={{ marginTop: 40 }}>
            {['Fill your profile', 'Get AI matches', 'Chat & connect', 'Move in'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 500 }}>{i + 1}</div>
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 14 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form fade-up">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, marginBottom: 6 }}>Create account</h2>
          <p style={{ color: 'var(--txt2)', fontSize: 14, marginBottom: 28 }}>
            Already registered? <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 500 }}>Sign in</Link>
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-wrap">
              <label className="input-label">Full name</label>
              <input className="input" name="name" placeholder="Rahul Sharma"
                value={form.name} onChange={handle} required />
            </div>
            <div className="input-wrap">
              <label className="input-label">Email address</label>
              <input className="input" type="email" name="email" placeholder="you@example.com"
                value={form.email} onChange={handle} required />
            </div>
            <div className="input-wrap">
              <label className="input-label">Phone (optional)</label>
              <input className="input" name="phone" placeholder="+91 98765 43210"
                value={form.phone} onChange={handle} />
            </div>
            <div className="input-wrap">
              <label className="input-label">Password</label>
              <input className="input" type="password" name="password" placeholder="Min 6 characters"
                value={form.password} onChange={handle} required />
            </div>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={18} /> : 'Create account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5 }}>
            By registering you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
