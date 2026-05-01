import api from './client'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  register:   (data) => api.post('/auth/register', data),
  login:      (data) => api.post('/auth/login', data),
  verifyOtp:  (data) => api.post('/auth/verify-otp', data),
  resendOtp:  (data) => api.post('/auth/resend-otp', data),
  me:         ()     => api.get('/auth/me'),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersAPI = {
  getById:        (id)   => api.get(`/users/${id}`),
  updateProfile:  (data) => api.post('/users/profile', data),
  // POST /users/location — saves GPS + GeoJSON point (backend v2)
  updateLocation: (data) => api.post('/users/location', data),
  // POST /users/profile/photo — multipart profile image
  uploadPhoto:    (form) => api.post('/users/profile/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const roomsAPI = {
  list:    ()         => api.get('/rooms'),
  getById: (id)       => api.get(`/rooms/${id}`),
  create:  (data)     => api.post('/rooms/create', data),
  update:  (id, data) => api.put(`/rooms/${id}`, data),
  delete:  (id)       => api.delete(`/rooms/${id}`),
  // GET /rooms/nearby (also available at /api/v1/rooms/nearby)
  nearby: (lat, lng, radius = 5) =>
    api.get(`/rooms/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  // POST /rooms/<id>/images — multipart, field name: images
  uploadImages: (id, form) => api.post(`/rooms/${id}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // POST /rooms/<id>/agreement — multipart, field name: agreement
  uploadAgreement: (id, form) => api.post(`/rooms/${id}/agreement`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
}

// ── Recommendations & Matching ────────────────────────────────────────────────
export const recommendAPI = {
  // GET /api/v1/recommendations/<user_id> — MongoDB-trained compatibility matches
  getMatches: (userId) => api.get(`/api/v1/recommendations/${userId}`),
  // GET /api/v1/roommates/nearby — geospatial roommate search
  nearbyRoommates: (lat, lng, radius = 5) =>
    api.get(`/api/v1/roommates/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  // POST /recommend/train — retrain model (admin)
  train: () => api.post('/recommend/train'),
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatAPI = {
  getRequests:   (userId)     => api.get(`/chat/requests/${userId}`),  // all requests for a user (inbox + sent)
  sendRequest:   (toUserId)   => api.post('/chat/request', { to_user_id: toUserId }),
  acceptRequest: (requestId)  => api.post('/chat/accept', { request_id: requestId }),
  rejectRequest: (requestId)  => api.post('/chat/reject', { request_id: requestId }),
  // Backend returns requests WHERE to_user_id = userId (inbox only)
  // We fetch both inbox and sent separately and merge in the component
  getInbox:      (userId)     => api.get(`/chat/requests/${userId}`),
  sendMessage:   (reqId, msg) => api.post('/chat/message', { request_id: reqId, message: msg }),
  getMessages:   (chatId)     => api.get(`/chat/messages/${chatId}`),
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const notifAPI = {
  getAll:   (userId) => api.get(`/notifications/${userId}`),
  markRead: (id)     => api.put(`/notifications/read/${id}`),
  delete:   (id)     => api.delete(`/notifications/${id}`),
}

// ── Documents / KYC ───────────────────────────────────────────────────────────
export const docsAPI = {
  // POST /documents/upload-profile — multipart, field: file
  uploadProfile: (form) => api.post('/documents/upload-profile', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // POST /documents/upload-id — multipart, field: file; runs OCR
  uploadId: (form) => api.post('/documents/upload-id', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // POST /documents/submit-kyc — multipart, field: document (no selfie needed)
  submitKyc: (form) => api.post('/documents/submit-kyc', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // GET /documents/status/<user_id>
  getStatus: (userId) => api.get(`/documents/status/${userId}`),
}

// ── Chat (additions) ──────────────────────────────────────────────────────────
// GET /chat/status/<other_user_id> — check request state between current user and another
// Returns { status: "none"|"pending"|"accepted", request_id, is_sender }
export const chatStatusAPI = (otherUserId) => api.get(`/chat/status/${otherUserId}`)