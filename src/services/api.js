const API_BASE = '/api';

export const getStoredToken = () => localStorage.getItem('tvtms_token') || localStorage.getItem('token');
export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('tvtms_user') || localStorage.getItem('user') || 'null'); }
  catch { return null; }
};
export const saveSession = (token, user) => {
  localStorage.setItem('tvtms_token', token);
  localStorage.setItem('tvtms_user', JSON.stringify(user));
  // Keep legacy keys for backward compatibility with existing TVTMS tooling.
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};
export const clearSession = () => {
  ['tvtms_token','tvtms_user','token','user'].forEach(key => localStorage.removeItem(key));
};

export class ApiError extends Error {
  constructor(message, status = 0, code = 'API_ERROR', payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isForm && options.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { cache: 'no-store', ...options, headers });
  } catch {
    throw new ApiError('Unable to connect to the TVTMS service. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new ApiError(payload?.message || `Request failed (${response.status})`, response.status, payload?.errorCode || 'API_ERROR', payload);
  }
  return payload ?? response;
}

export async function apiBlobRequest(endpoint) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload?.message || 'Unable to download file.', response.status, payload?.errorCode);
  }
  return response.blob();
}

const qs = (params = {}) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  });
  return s.toString();
};

export const API = {
  health: () => apiRequest('/health'),
  login: credentials => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  profile: () => apiRequest('/auth/profile'),
  requestPasswordReset: email => apiRequest('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword) => apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),

  users: () => apiRequest('/users'),
  user: id => apiRequest(`/users/${id}`),
  createUser: data => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: id => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  unlockUser: id => apiRequest(`/users/${id}/unlock`, { method: 'POST' }),
  updateMe: data => apiRequest('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: data => apiRequest('/users/change-password', { method: 'POST', body: JSON.stringify(data) }),
  auditLogs: (limit = 200) => apiRequest(`/users/audit-logs?limit=${encodeURIComponent(limit)}`),
  clearTestAuditLogs: () => apiRequest('/users/audit-logs/clear', { method: 'DELETE' }),

  violations: () => apiRequest('/violations'),
  activeViolations: () => apiRequest('/violations/active'),
  violation: id => apiRequest(`/violations/${id}`),
  createViolation: data => apiRequest('/violations', { method: 'POST', body: JSON.stringify(data) }),
  updateViolation: (id, data) => apiRequest(`/violations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteViolation: id => apiRequest(`/violations/${id}`, { method: 'DELETE' }),
  penaltyPreview: (id, plateNumber) => apiRequest(`/violations/${id}/penalty-preview?${qs({ plateNumber })}`),

  tickets: filters => apiRequest(`/tickets${qs(filters) ? `?${qs(filters)}` : ''}`),
  ticket: id => apiRequest(`/tickets/${id}`),
  createTicket: data => apiRequest('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  retryTicketNotification: id => apiRequest(`/tickets/${id}/notification/retry`, { method: 'POST' }),
  updateTicket: (id, data) => apiRequest(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateTicketDetails: (id, data) => apiRequest(`/tickets/${id}/details`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelTicket: (id, reason) => apiRequest(`/tickets/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  permanentDeleteTicket: (id, reason) => apiRequest(`/tickets/${id}/permanent`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  markUnpaid: (id, reason) => apiRequest(`/tickets/${id}/mark-unpaid`, { method: 'PUT', body: JSON.stringify({ reason }) }),
  ticketStats: filters => apiRequest(`/tickets/stats${qs(filters) ? `?${qs(filters)}` : ''}`),
  searchTickets: search => apiRequest(`/tickets/search?${qs({ search })}`),

  paymentsForTicket: id => apiRequest(`/payments/ticket/${id}`),
  recordPayment: data => apiRequest('/payments', { method: 'POST', body: JSON.stringify(data) }),

  disputes: filters => apiRequest(`/disputes${qs(filters) ? `?${qs(filters)}` : ''}`),
  createDispute: data => apiRequest('/disputes', { method: 'POST', body: JSON.stringify(data) }),
  resolveDispute: (id, data) => apiRequest(`/disputes/${id}/resolve`, { method: 'PUT', body: JSON.stringify(data) }),

  evidence: ticketId => apiRequest(`/evidence/ticket/${ticketId}`),
  uploadEvidence: (ticketId, file, extras = {}) => {
    const body = new FormData(); body.append('evidence', file);
    Object.entries(extras).forEach(([k,v]) => v != null && body.append(k, v));
    return apiRequest(`/evidence/ticket/${ticketId}`, { method: 'POST', body });
  },
  evidenceFile: id => apiBlobRequest(`/evidence/${id}/file`),

  notifications: () => apiRequest('/notifications'),
  readNotification: id => apiRequest(`/notifications/${id}/read`, { method: 'PUT' }),
  deleteNotification: id => apiRequest(`/notifications/${id}`, { method: 'DELETE' }),
  deleteNotifications: ids => apiRequest('/notifications/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  deleteAllNotifications: () => apiRequest('/notifications', { method: 'DELETE' }),
  contactMessage: id => apiRequest(`/contact-messages/${id}`),

  settings: () => apiRequest('/system/settings'),
  setting: key => apiRequest(`/system/settings/${encodeURIComponent(key)}`),
  updateSettings: data => apiRequest('/system/settings', { method: 'PUT', body: JSON.stringify(data) }),
  updateSettingsBulk: data => apiRequest('/system/settings/bulk/update', { method: 'PUT', body: JSON.stringify(data) }),

  vehicles: () => apiRequest('/vehicles'),
  vehicle: id => apiRequest(`/vehicles/${id}`),
  vehicleLookup: plateNumber => apiRequest(`/vehicles/lookup?${qs({ plateNumber })}`),
  vehicleSearch: filters => apiRequest(`/vehicles/search?${qs(filters)}`),
  vehicleStats: plateNumber => apiRequest(`/vehicles/stats?${qs({ plateNumber })}`),

  publicStats: () => apiRequest('/public/stats'),
  publicViolations: () => apiRequest('/public/violations'),
  publicTicketLookup: filters => apiRequest(`/public/ticket-lookup?${qs(filters)}`),
  publicVehicleLookup: plateNumber => apiRequest(`/public/vehicle-lookup?${qs({ plateNumber })}`),
  publicPlateSummary: plateNumber => apiRequest(`/public/plate-summary?${qs({ plateNumber })}`),
  publicDispute: data => apiRequest('/public/dispute', { method: 'POST', body: JSON.stringify(data) }),
  publicContact: data => apiRequest('/public/contact', { method: 'POST', body: JSON.stringify(data) }),

  report: (name, filters = {}) => apiRequest(`/reports/${name}${qs(filters) ? `?${qs(filters)}` : ''}`),
  reportPdf: filters => apiBlobRequest(`/reports/export/pdf${qs(filters) ? `?${qs(filters)}` : ''}`),
};

export const dataOf = (response, fallback = []) => response?.data ?? response?.tickets ?? response?.users ?? response?.violations ?? response?.notifications ?? response?.disputes ?? response?.payments ?? fallback;
