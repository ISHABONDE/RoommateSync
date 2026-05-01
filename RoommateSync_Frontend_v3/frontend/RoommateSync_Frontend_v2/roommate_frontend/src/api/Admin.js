import api from './client'

export const adminAPI = {
  analytics:      ()               => api.get('/admin/analytics'),
  listUsers:      (params)         => api.get('/admin/users', { params }),
  getUser:        (id)             => api.get(`/admin/users/${id}`),
  deleteUser:     (id)             => api.delete(`/admin/users/${id}`),
  promoteUser:    (id, is_admin)   => api.patch(`/admin/users/${id}/promote`, { is_admin }),
  pendingKyc:     ()               => api.get('/admin/pending-kyc'),
  verifyDocument: (data)           => api.post('/admin/verify-document', data),
  listRooms:      (params)         => api.get('/admin/rooms', { params }),
  deleteRoom:     (id)             => api.delete(`/admin/rooms/${id}`),
  retrainModel:   ()               => api.post('/admin/retrain-model'),
}