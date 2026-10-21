import axios from 'axios';

const TOKEN_KEY = 'vqa_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (value) => value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);

const http = axios.create({ baseURL: '/api', timeout: 120000 });
http.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function apiError(e) {
  const detail = e?.response?.data?.detail || e?.response?.data?.error?.message;
  if (detail) return { code: e.response.status === 401 ? 'AUTH' : 'REQUEST', message: typeof detail === 'string' ? detail : 'درخواست انجام نشد.', status: e.response.status };
  if (e?.code === 'ECONNABORTED') return { code: 'TIMEOUT', message: 'زمان ارتباط با سرور به پایان رسید؛ دوباره تلاش کنید.' };
  if (!e?.response) return { code: 'NETWORK', message: 'ارتباط با سرور برقرار نشد؛ اجرای بک‌اند را بررسی کنید.' };
  return { code: 'UNKNOWN', message: 'خطای ناشناخته رخ داد.' };
}

export const imageSrc = (image) => image?.src || null;

export const api = {
  config: () => http.get('/config'),
  login: (username, password) => http.post('/auth/login', { username, password }),
  register: (username, display_name, password) => http.post('/auth/register', { username, display_name, password }),
  me: () => http.get('/auth/me'),
  logout: () => http.post('/auth/logout'),
  list: () => http.get('/conversations'),
  get: (id) => http.get(`/conversations/${id}`),
  image: (id) => http.get(`/images/${encodeURIComponent(id)}`, { responseType: 'blob' }),
  create: (file) => { const data = new FormData(); data.append('image', file); return http.post('/conversations', data); },
  addB: (id, file) => { const data = new FormData(); data.append('image', file); return http.post(`/conversations/${id}/image-b`, data); },
  rename: (id, title) => http.patch(`/conversations/${id}`, { title }),
  remove: (id) => http.delete(`/conversations/${id}`),
  ask: (id, payload) => http.post(`/conversations/${id}/messages`, payload),
  feedback: (id, mid, value) => http.post(`/messages/${mid}/rate`, { rating: value === 'like' ? 1 : value === 'dislike' ? -1 : 0 }),
};

export async function validateImageFile(file, cfg) {
  const bad = 'فرمت یا حجم تصویر قابل قبول نیست. لطفاً تصویری با فرمت و اندازهٔ مجاز انتخاب کنید.';
  if (!file) return { ok: false, message: 'فایلی انتخاب نشده است.' };
  if (!(cfg.allowedTypes || ['image/jpeg', 'image/png', 'image/webp']).includes(file.type)) return { ok: false, message: bad };
  if (file.size > (cfg.maxUploadMb || 10) * 1024 * 1024) return { ok: false, message: bad };
  try {
    const url = URL.createObjectURL(file);
    const dims = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.onerror = reject; img.src = url; });
    URL.revokeObjectURL(url);
    if (Math.min(...dims) < 32) return { ok: false, message: 'ابعاد تصویر بسیار کوچک است.' };
  } catch { return { ok: false, message: 'فایل تصویر خراب یا ناخوانا است.' }; }
  return { ok: true };
}
