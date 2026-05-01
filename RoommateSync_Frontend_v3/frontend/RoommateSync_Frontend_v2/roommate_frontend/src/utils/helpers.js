export const avatarColors = [
  { bg: '#B5D4F4', fg: '#0C447C' },
  { bg: '#9FE1CB', fg: '#085041' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#FAEEDA', fg: '#9A4A12' },
  { bg: '#F5C4B3', fg: '#993C1D' },
  { bg: '#C0DD97', fg: '#3B6D11' },
]

export function getAvatarColor(name = '') {
  const idx = name.charCodeAt(0) % avatarColors.length
  return avatarColors[idx]
}

export function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function scoreColor(score) {
  if (score >= 85) return '#0F6E56'
  if (score >= 70) return '#3B6D11'
  if (score >= 55) return '#BA7517'
  return '#993C1D'
}

export function scoreBg(score) {
  if (score >= 85) return '#E1F5EE'
  if (score >= 70) return '#EAF3DE'
  if (score >= 55) return '#FAEEDA'
  return '#FAECE7'
}

export function formatCurrency(n) {
  if (!n) return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export function formatRelativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function verificationLabel(status) {
  const map = { 0: 'Not verified', 1: 'Pending', 2: 'Verified', 3: 'Rejected' }
  return map[status] ?? 'Unknown'
}

export function verificationClass(status) {
  const map = { 0: 'badge-gray', 1: 'badge-blue', 2: 'badge-green', 3: 'badge' }
  return map[status] ?? 'badge-gray'
}
