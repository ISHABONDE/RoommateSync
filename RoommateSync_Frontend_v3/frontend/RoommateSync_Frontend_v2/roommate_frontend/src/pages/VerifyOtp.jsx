import { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../api'
import { Spinner } from '../components/Shared'

export default function VerifyOtp() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const email     = location.state?.email || ''
  const [otp, setOtp]       = useState(['', '', '', '', '', ''])
  const [loading, setLoading]   = useState(false)
  const [resending, setResending] = useState(false)
  const refs = useRef([])

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[i] = val
    setOtp(next)
    if (val && i < 5) refs.current[i + 1]?.focus()
  }

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      refs.current[5]?.focus()
    }
  }

  const submit = async () => {
    const code = otp.join('')
    if (code.length < 6) { toast.error('Enter the 6-digit OTP.'); return }
    setLoading(true)
    try {
      const res = await authAPI.verifyOtp({ email, otp: code })
      if (res.data.success) {
        toast.success('Email verified! Please sign in.')
        navigate('/login')
      } else {
        toast.error(res.data.message)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    setResending(true)
    try {
      const res = await authAPI.resendOtp({ email })
      toast.success(res.data.message || 'OTP resent!')
    } catch {
      toast.error('Failed to resend OTP.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 420, padding: 40, background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 5h16a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1Z" stroke="var(--brand)" strokeWidth="1.4"/>
            <path d="M2 6l9 7 9-7" stroke="var(--brand)" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, marginBottom: 8 }}>Check your email</h2>
        <p style={{ color: 'var(--txt2)', fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
          We sent a 6-digit code to <strong style={{ color: 'var(--txt)' }}>{email}</strong>.<br />
          Enter it below to verify your account.
        </p>

        <div className="otp-inputs" style={{ marginBottom: 28 }} onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => refs.current[i] = el}
              className="otp-input"
              type="text" inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
            />
          ))}
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={loading}>
          {loading ? <Spinner size={18} /> : 'Verify email'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--txt2)' }}>
          Didn't receive it?{' '}
          <button onClick={resend} disabled={resending}
            style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
            {resending ? 'Resending…' : 'Resend OTP'}
          </button>
        </p>
      </div>
    </div>
  )
}
