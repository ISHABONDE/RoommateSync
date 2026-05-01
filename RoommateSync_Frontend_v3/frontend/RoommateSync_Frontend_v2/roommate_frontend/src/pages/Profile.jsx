import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { usersAPI, docsAPI } from '../api'
import { Avatar, Spinner, PageLoader } from '../components/Shared'
import { verificationLabel, verificationClass } from '../utils/helpers'

const TABS = ['Overview', 'Preferences', 'Location', 'Documents']

const SLEEP_OPTIONS   = ['Early bird (before 10pm)', 'Normal (10pm–midnight)', 'Night owl (after midnight)']
const CLEAN_OPTIONS   = ['Very clean', 'Clean', 'Average', 'Relaxed']
const SOCIAL_OPTIONS  = ['Very introvert', 'Introvert', 'Balanced', 'Extrovert', 'Very extrovert']
const NOISE_OPTIONS   = ['Very sensitive', 'Sensitive', 'Moderate', 'Tolerant', 'Very tolerant']
const STUDY_OPTIONS   = ['No study / WFH', 'Light', 'Heavy']
const GUEST_OPTIONS   = ['Never', 'Rarely', 'Sometimes', 'Often']

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [searchParams]        = useSearchParams()
  const defaultTab = TABS.indexOf(searchParams.get('tab') || 'Overview')
  const [tab, setTab]         = useState(defaultTab >= 0 ? defaultTab : 0)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadProfile() }, [user])

  const loadProfile = async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await usersAPI.getById(user.user_id)
      if (res.data.success) setProfile(res.data.user)
    } catch {} finally { setLoading(false) }
  }

  const save = async (fields) => {
    setSaving(true)
    try {
      await usersAPI.updateProfile(fields)
      await refreshUser()
      await loadProfile()
      toast.success('Profile updated!')
    } catch { toast.error('Failed to save.') }
    finally { setSaving(false) }
  }

  if (loading || !profile) return <PageLoader />

  return (
    <div>
      {/* Hero banner */}
      <div className="profile-hero-banner">
        <div style={{ position: 'absolute', bottom: -36, left: 28, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={profile.name} src={profile.profile_image || ''} size={72} style={{ border: '3px solid var(--bg-card)' }} />
            <PhotoUploadBtn userId={profile.user_id} onDone={loadProfile} />
          </div>
          <div style={{ paddingBottom: 8 }}>
            <h2 style={{ fontSize: 22, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.3)' }}>{profile.name}</h2>
            <span className={`badge ${verificationClass(profile.verification_status)}`} style={{ marginTop: 3 }}>
              {verificationLabel(profile.verification_status)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 52 }} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '16px 28px 0', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`btn btn-sm ${tab === i ? 'btn-primary' : 'btn-ghost'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="page-body">
        {tab === 0 && <OverviewTab profile={profile} saving={saving} onSave={save} />}
        {tab === 1 && <PreferencesTab profile={profile} saving={saving} onSave={save} />}
        {tab === 2 && <LocationTab profile={profile} saving={saving} onSave={save} />}
        {tab === 3 && <DocumentsTab profile={profile} onDone={loadProfile} />}
      </div>
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({ profile, saving, onSave }) {
  const [form, setForm] = useState({ name: profile.name || '', phone: profile.phone || '' })
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ fontSize: 18, marginBottom: 20 }}>Basic information</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="input-wrap">
          <label className="input-label">Full name</label>
          <input className="input" name="name" value={form.name} onChange={handle} />
        </div>
        <div className="input-wrap">
          <label className="input-label">Email</label>
          <input className="input" value={profile.email} disabled style={{ opacity: .6 }} />
        </div>
        <div className="input-wrap">
          <label className="input-label">Phone</label>
          <input className="input" name="phone" value={form.phone} onChange={handle} placeholder="+91 98765 43210" />
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
          onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Preferences ──────────────────────────────────────────────────────────
function PreferencesTab({ profile, saving, onSave }) {
  const [form, setForm] = useState({
    sleep_time:     profile.sleep_time    ?? 1,
    cleanliness:    profile.cleanliness   ?? 2,
    social_level:   profile.social_level  ?? 2,
    noise_tolerance:profile.noise_tolerance ?? 2,
    study_habit:    profile.study_habit   ?? 0,
    guest_frequency:profile.guest_frequency ?? 1,
    smoking:        profile.smoking       ?? 0,
    Alcohol:        profile.Alcohol       ?? 0,
    room_rent:      profile.room_rent     ?? '',
    roommates_needed: profile.roommates_needed ?? 1,
  })

  const handleNum = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ fontSize: 18, marginBottom: 20 }}>Lifestyle & preferences</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        <SelectRow label="Sleep schedule" value={form.sleep_time} options={SLEEP_OPTIONS}
          onChange={v => handleNum('sleep_time', v)} />
        <SelectRow label="Cleanliness level" value={form.cleanliness} options={CLEAN_OPTIONS}
          onChange={v => handleNum('cleanliness', v)} />
        <SelectRow label="Social level" value={form.social_level} options={SOCIAL_OPTIONS}
          onChange={v => handleNum('social_level', v)} />
        <SelectRow label="Noise tolerance" value={form.noise_tolerance} options={NOISE_OPTIONS}
          onChange={v => handleNum('noise_tolerance', v)} />
        <SelectRow label="Study / work habit" value={form.study_habit} options={STUDY_OPTIONS}
          onChange={v => handleNum('study_habit', v)} />
        <SelectRow label="Guest frequency" value={form.guest_frequency} options={GUEST_OPTIONS}
          onChange={v => handleNum('guest_frequency', v)} />

        <div className="grid-2">
          <ToggleRow label="Smoking" value={form.smoking} onChange={v => handleNum('smoking', v)} />
          <ToggleRow label="Alcohol" value={form.Alcohol} onChange={v => handleNum('Alcohol', v)} />
        </div>

        <div className="input-wrap">
          <label className="input-label">Monthly budget (₹)</label>
          <input className="input" type="number" value={form.room_rent}
            onChange={e => setForm(f => ({ ...f, room_rent: +e.target.value }))} placeholder="8000" />
        </div>
        <div className="input-wrap">
          <label className="input-label">Roommates needed</label>
          <input className="input" type="number" min="1" max="10" value={form.roommates_needed}
            onChange={e => setForm(f => ({ ...f, roommates_needed: +e.target.value }))} />
        </div>

        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
          onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Save preferences'}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Location ─────────────────────────────────────────────────────────────
function LocationTab({ profile, saving, onSave }) {
  const [form, setForm] = useState({
    city:               profile.city               || '',
    area:               profile.area               || '',
    pincode:            profile.pincode             || '',
    latitude:           profile.latitude            ?? '',
    longitude:          profile.longitude           ?? '',
    preferred_distance: profile.preferred_distance  ?? 5,
  })
  const [locSaving, setLocSaving] = useState(false)
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const useGPS = () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(pos => {
      setForm(f => ({
        ...f,
        latitude:  pos.coords.latitude.toFixed(6),
        longitude: pos.coords.longitude.toFixed(6),
      }))
    }, () => alert('Could not get location. Check browser permissions.'))
  }

  const saveLocation = async () => {
    // BUG FIX: latitude/longitude from text inputs are strings.
    // POST /users/location expects floats. Parse them explicitly.
    // Also use usersAPI.updateLocation (POST /users/location) which saves
    // both flat fields AND GeoJSON Point for $near queries.
    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid latitude and longitude numbers.')
      return
    }
    setLocSaving(true)
    try {
      const { usersAPI } = await import('../api')
      await usersAPI.updateLocation({
        latitude:  lat,
        longitude: lng,
        city:      form.city,
        area:      form.area,
        pincode:   form.pincode,
      })
      // Also save preferred_distance via updateProfile
      await onSave({ preferred_distance: form.preferred_distance })
    } catch { alert('Failed to save location.') }
    finally { setLocSaving(false) }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ fontSize: 18, marginBottom: 20 }}>Your location</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="grid-2">
          <div className="input-wrap">
            <label className="input-label">City</label>
            <input className="input" name="city" value={form.city} onChange={handle} placeholder="Pune" />
          </div>
          <div className="input-wrap">
            <label className="input-label">Area</label>
            <input className="input" name="area" value={form.area} onChange={handle} placeholder="Hinjewadi" />
          </div>
        </div>
        <div className="input-wrap">
          <label className="input-label">Pincode</label>
          <input className="input" name="pincode" value={form.pincode} onChange={handle} placeholder="411057" />
        </div>
        <div className="grid-2">
          <div className="input-wrap">
            <label className="input-label">Latitude</label>
            <input className="input" type="number" step="any" name="latitude"
              value={form.latitude} onChange={handle} placeholder="18.6298" />
          </div>
          <div className="input-wrap">
            <label className="input-label">Longitude</label>
            <input className="input" type="number" step="any" name="longitude"
              value={form.longitude} onChange={handle} placeholder="73.7997" />
          </div>
        </div>
        <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={useGPS}>
          📍 Use my GPS location
        </button>
        <div className="input-wrap">
          <label className="input-label">
            Search radius: <strong>{form.preferred_distance} km</strong>
          </label>
          <input type="range" min="1" max="30" step="1" value={form.preferred_distance}
            onChange={e => setForm(f => ({ ...f, preferred_distance: parseInt(e.target.value, 10) }))} />
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
          onClick={saveLocation} disabled={locSaving || saving}>
          {(locSaving || saving) ? <Spinner size={16} /> : 'Save location'}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Documents ────────────────────────────────────────────────────────────
function DocumentsTab({ profile, onDone }) {
  const [docFile,    setDocFile]    = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [kycResult,  setKycResult]  = useState(null)

  const verStatus = profile.verification_status

  const statusConfig = {
    0: { label: 'Not verified',   bg: 'var(--bg-hover)', color: 'var(--txt2)', icon: '○' },
    1: { label: 'Pending review', bg: '#FFF8E6',          color: '#854F0B',     icon: '⏳' },
    2: { label: 'Verified',       bg: '#EAF3DE',          color: '#27500A',     icon: '✓' },
    3: { label: 'Rejected',       bg: '#FCEBEB',          color: '#791F1F',     icon: '✗' },
  }
  const sc = statusConfig[verStatus] ?? statusConfig[0]

  const submitKyc = async () => {
    if (!docFile) {
      toast.error('Please select your government-issued ID document.')
      return
    }
    setSubmitting(true)
    setKycResult(null)
    try {
      const form = new FormData()
      form.append('document', docFile)
      const res = await docsAPI.submitKyc(form)
      setKycResult(res.data)
      if (res.data.success) {
        const status = res.data.verification_status
        if (status === 2) toast.success('Verification approved automatically!')
        else if (status === 3) toast.error('Document unreadable. Please upload a clearer image.')
        else toast.success('Document submitted! Under manual review.')
        setDocFile(null)
        onDone()
      } else {
        toast.error(res.data.message || 'Submission failed.')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Try again.')
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ fontSize: 18, marginBottom: 6 }}>Identity Verification</h3>
      <p style={{ color: 'var(--txt2)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
        Upload a government-issued ID to get verified. Our system reads the document
        automatically and compares the name with your registered name "{profile.name}".
        No selfie required.
      </p>

      {/* Status banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: sc.bg, borderRadius: 'var(--r-sm)', marginBottom: 24,
        border: `1px solid ${sc.color}30` }}>
        <span style={{ fontSize: 18 }}>{sc.icon}</span>
        <div>
          <div style={{ fontWeight: 500, color: sc.color, fontSize: 14 }}>Status: {sc.label}</div>
          {verStatus === 2 && (
            <div style={{ fontSize: 12, color: sc.color, marginTop: 2 }}>
              Your identity has been verified. Your profile shows a verified badge.
            </div>
          )}
          {verStatus === 3 && (
            <div style={{ fontSize: 12, color: sc.color, marginTop: 2 }}>
              Document unreadable. Please re-upload a clearer, well-lit image of your ID.
            </div>
          )}
          {verStatus === 1 && (
            <div style={{ fontSize: 12, color: sc.color, marginTop: 2 }}>
              Document received. Our team is reviewing it manually.
            </div>
          )}
        </div>
      </div>

      {/* Extracted OCR data (if available) */}
      {profile.ocr_data?.name && (
        <div className="card card-sm" style={{ background: 'var(--bg-hover)', marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Extracted from your ID</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <InfoRow label="Name on ID" value={profile.ocr_data.name} />
            {profile.ocr_data.id_number && <InfoRow label="ID number" value={profile.ocr_data.id_number} />}
          </div>
        </div>
      )}

      {/* Upload form — show unless already verified */}
      {verStatus !== 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* How it works */}
          <div style={{ fontSize: 12, padding: '10px 14px', background: '#E6F1FB',
            border: '1px solid #B5D4F4', borderRadius: 'var(--r-sm)', color: '#185FA5',
            lineHeight: 1.7 }}>
            <strong>How verification works:</strong><br />
            1. Upload your Aadhaar, PAN, Passport, or Driving License &nbsp;·&nbsp;
            2. System reads the name &amp; ID number via OCR &nbsp;·&nbsp;
            3. Name is compared with your registered name — no selfie needed
          </div>

          {/* Document file picker */}
          <div className="card card-sm">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)',
                background: docFile ? '#EAF3DE' : 'var(--bg-hover)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0 }}>
                {docFile ? '✓' : '🪪'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>Government-issued ID</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
                  {docFile ? docFile.name : 'Aadhaar, PAN, Passport, or Driving License (JPG / PNG / PDF)'}
                </div>
              </div>
              <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
                {docFile ? 'Change' : 'Select'}
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }}
                  onChange={e => setDocFile(e.target.files[0] || null)} />
              </label>
            </div>
          </div>

          <button className="btn btn-primary" onClick={submitKyc}
            disabled={!docFile || submitting}>
            {submitting
              ? <><Spinner size={16} /> Verifying…</>
              : 'Submit for verification'}
          </button>
        </div>
      )}

      {/* Result card */}
      {kycResult && (
        <div style={{ marginTop: 20 }}>
          <KycResultCard result={kycResult} profileName={profile.name} />
        </div>
      )}
    </div>
  )
}

// ── KYC result display ─────────────────────────────────────────────────────────
function KycResultCard({ result, profileName }) {
  const status   = result.verification_status
  const details  = result.details || {}
  const nameComp = details.name_comparison
  const ocr      = details.ocr || {}

  const configs = {
    2: { bg: '#EAF3DE', border: '#C0DD97', color: '#27500A', title: 'Verification approved',   icon: '✅' },
    3: { bg: '#FCEBEB', border: '#F7C1C1', color: '#791F1F', title: 'Document unreadable',     icon: '❌' },
    1: { bg: '#FFF8E6', border: '#FAC775', color: '#854F0B', title: 'Pending manual review',   icon: '⏳' },
  }
  const cfg = configs[status] ?? configs[1]

  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 'var(--r)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{cfg.icon}</span>
        <div style={{ fontWeight: 500, fontSize: 15, color: cfg.color }}>{cfg.title}</div>
      </div>
      <p style={{ fontSize: 13, color: cfg.color, lineHeight: 1.6, marginBottom: 12 }}>
        {result.message}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* OCR step */}
        <StepRow
          ok={!!(ocr.name || ocr.id_number)}
          label="Document OCR"
          value={ocr.name
            ? `Name: ${ocr.name}  ·  ID: ${ocr.id_number || 'not found'}`
            : 'Could not extract text — please upload a clearer image'}
        />
        {/* Name match step */}
        {nameComp && (
          <StepRow
            ok={nameComp.match}
            label="Name match"
            value={`"${nameComp.ocr_name}" vs profile "${profileName}" — ${Math.round((nameComp.score || 0) * 100)}% match`}
          />
        )}
      </div>
    </div>
  )
}

function StepRow({ ok, label, value }) {
  if (ok === undefined || ok === null) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12 }}>
      <span style={{ color: ok ? '#27500A' : '#791F1F', fontWeight: 600, flexShrink: 0 }}>
        {ok ? '✓' : '✗'}
      </span>
      <div>
        <span style={{ color: 'var(--txt2)' }}>{label}: </span>
        <span style={{ color: 'var(--txt)', fontWeight: 500 }}>{value}</span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SelectRow({ label, value, options, onChange }) {
  return (
    <div>
      <label className="input-label" style={{ display: 'block', marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt, i) => (
          <button key={i} onClick={() => onChange(i)}
            className={`btn btn-sm ${value === i ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12 }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="card card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {['No', 'Yes'].map((opt, i) => (
          <button key={i} onClick={() => onChange(i)}
            className={`btn btn-sm ${value === i ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '5px 12px' }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function UploadCard({ title, subtitle, current, accept, uploading, onFile }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {current ? '✅' : '📄'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{subtitle}</div>
        {current && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{current}</div>}
      </div>
      <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', flexShrink: 0 }}>
        {uploading ? <Spinner size={14} /> : current ? 'Replace' : 'Upload'}
        <input type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => onFile(e.target.files[0])} disabled={uploading} />
      </label>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function PhotoUploadBtn({ userId, onDone }) {
  const { refreshUser } = useAuth()
  const [uploading, setUploading] = useState(false)
  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await docsAPI.uploadProfile(form)
      toast.success('Photo updated!')
      // Refresh full user in context so sidebar + all Avatars update immediately
      await refreshUser()
      onDone()
    } catch { toast.error('Upload failed.') }
    finally { setUploading(false) }
  }
  return (
    <label style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid var(--bg-card)' }}>
      {uploading ? <Spinner size={12} /> : <span style={{ color: '#fff', fontSize: 12 }}>+</span>}
      <input type="file" accept=".jpg,.jpeg,.png" style={{ display: 'none' }} onChange={upload} />
    </label>
  )
}
