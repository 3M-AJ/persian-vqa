import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiError, getToken, setToken, validateImageFile } from './api.js';
import LoginScreen from './components/LoginScreen.jsx';
import Header from './components/Header.jsx';
import Canvas from './components/Canvas.jsx';
import BottomBar from './components/BottomBar.jsx';
import HistoryDock from './components/HistoryDock.jsx';
import Modal from './components/Modal.jsx';
import { guessLevel, toFa } from './levels.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [cfg, setCfg] = useState({ maxUploadMb: 10, maxQuestionLen: 4000, maxAttempts: 1 });
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [tool, setTool] = useState('pin');
  const [compare, setCompare] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [openCard, setOpenCard] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState({ boxPx: 50, showOldPins: true });
  const fileInput = useRef(null);
  const pickSlot = useRef(undefined);
  const toastTimer = useRef(null);
  const imageUrls = useRef(new Map());

  const notify = useCallback((message, kind = 'error') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }, []);

  const imageUrl = useCallback(async (id) => {
    if (!id) return null;
    if (imageUrls.current.has(id)) return imageUrls.current.get(id);
    const { data } = await api.image(id);
    const url = URL.createObjectURL(data);
    imageUrls.current.set(id, url);
    return url;
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const rows = (await api.list()).data.items;
      const items = await Promise.all(rows.map(async (c) => ({ ...c, image: { ...c.image, src: await imageUrl(c.image.id) } })));
      setConvs(items);
    } catch (e) { notify(apiError(e).message); }
  }, [imageUrl, notify]);

  useEffect(() => () => {
    imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
    clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    (async () => {
      try { setCfg((await api.config()).data); } catch { /* use local defaults */ }
      if (getToken()) {
        try {
          const { data } = await api.me();
          setUser(data.user);
          await refreshList();
        } catch { setToken(null); }
      }
      setBooting(false);
    })();
  }, [refreshList]);

  const login = async (username, password) => {
    setLoginBusy(true); setLoginErr('');
    try {
      const { data } = await api.login(username, password);
      setToken(data.token); setUser(data.user); await refreshList();
    } catch (e) { setLoginErr(apiError(e).message); }
    setLoginBusy(false);
  };

  const register = async (username, displayName, password) => {
    setLoginBusy(true); setLoginErr('');
    try {
      const { data } = await api.register(username, displayName, password);
      setToken(data.token); setUser(data.user); await refreshList();
    } catch (e) { setLoginErr(apiError(e).message); }
    setLoginBusy(false);
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* local session is cleared either way */ }
    imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
    imageUrls.current.clear();
    setToken(null); setUser(null); setActive(null); setConvs([]); setPending([]); setOpenCard(null); setCompare(false);
  };

  const openConversation = useCallback(async (id) => {
    try {
      const { data } = await api.get(id);
      const c = data.conversation;
      const src = await imageUrl(c.images.A.id);
      const srcB = c.images.B ? await imageUrl(c.images.B.id) : null;
      const messages = (c.messages || []).map((m) => ({ ...m, pins: (m.pins || []).map((p) => ({ ...p, pending: false, msgId: m.id })) }));
      setActive({ ...c, images: { A: { ...c.images.A, src }, B: c.images.B ? { ...c.images.B, src: srcB } : null }, messages });
      setPending([]); setOpenCard(null); setCompare(!!c.images.B);
    } catch (e) { notify(apiError(e).message); }
  }, [imageUrl, notify]);

  const newProject = () => { setActive(null); setPending([]); setOpenCard(null); setCompare(false); };

  const navigate = (dir) => {
    const index = convs.findIndex((c) => c.id === active?.id);
    const next = convs[index + dir];
    if (next) openConversation(next.id);
  };

  const rename = async (c) => {
    const title = window.prompt('نام جدید گفتگو:', c.title);
    if (!title?.trim()) return;
    try {
      await api.rename(c.id, title.trim());
      setActive((a) => (a?.id === c.id ? { ...a, title: title.trim() } : a));
      await refreshList();
    } catch (e) { notify(apiError(e).message); }
  };

  const remove = async (c) => {
    if (!window.confirm(`گفتگوی «${c.title}» و تصویر آن برای همیشه حذف شود؟`)) return;
    try {
      await api.remove(c.id);
      if (active?.id === c.id) newProject();
      await refreshList();
    } catch (e) { notify(apiError(e).message); }
  };

  const handleFile = useCallback(async (file, slot) => {
    const valid = await validateImageFile(file, cfg);
    if (!valid.ok) return notify(valid.message);
    setUploading(true);
    try {
      const addAsB = active && (slot === 'B' || (slot === undefined && compare));
      if (addAsB) {
        const { data } = await api.addB(active.id, file);
        const b = data.conversation.images.B;
        const src = await imageUrl(b.id);
        setActive((current) => current?.id === active.id ? { ...current, images: { ...current.images, B: { ...b, src } } } : current);
        setCompare(true);
      } else {
        const { data } = await api.create(file);
        const c = data.conversation;
        const src = await imageUrl(c.images.A.id);
        setActive({ ...c, images: { A: { ...c.images.A, src }, B: null }, messages: [] });
        setPending([]); setOpenCard(null); setCompare(false); setTool('pin');
      }
      await refreshList();
    } catch (e) { notify(apiError(e).message); }
    setUploading(false);
  }, [active, compare, cfg, imageUrl, notify, refreshList]);

  const committed = (active?.messages || []).flatMap((m) => (m.pins || []).map((p) => ({ ...p, msgId: m.id, pending: false })));
  const addPin = (p) => {
    const used = [...committed, ...pending].map((item) => item.n);
    setPending((items) => [...items, { id: uid(), n: Math.max(0, ...used) + 1, group: 'draft', pending: true, ...p }].slice(0, 8));
    setOpenCard(null);
  };
  const updatePin = (id, patch) => setPending((items) => items.map((p) => p.id === id ? { ...p, ...patch } : p));
  const removePin = (id) => setPending((items) => items.filter((p) => p.id !== id));
  const onPinClick = (pin) => {
    if (pin.pending) return;
    const message = [...(active?.messages || [])].reverse().find((m) => m.pins.some((p) => p.id === pin.id));
    if (message) setOpenCard({ msgId: message.id, pinId: pin.id });
  };

  const ask = useCallback(async (text, source) => {
    const q = text.trim();
    if (!active || !q || sending) return;
    if (q.length > cfg.maxQuestionLen) return notify(`پرسش نباید بیش از ${toFa(cfg.maxQuestionLen)} نویسه باشد.`);
    const pins = source === 'pins' ? pending.map(({ id, n, image, cx, cy, box }) => ({ id, n, image, cx, cy, box })) : [];
    setSending(true);
    try {
      const { data } = await api.ask(active.id, { question: q, pins, level: guessLevel(q), mode: compare && active.images.B ? 'compare' : 'single' });
      const message = data.message;
      setActive((c) => c?.id === active.id ? { ...c, messages: [...c.messages, message] } : c);
      if (source === 'pins') setPending([]);
      setOpenCard({ msgId: message.id, pinId: message.pins?.[0]?.id });
      await refreshList();
    } catch (e) { notify(apiError(e).message); }
    setSending(false);
  }, [active, cfg.maxQuestionLen, compare, notify, pending, refreshList, sending]);

  const feedback = async (msg, value) => {
    const next = msg.feedback === value ? null : value;
    setActive((c) => c && ({ ...c, messages: c.messages.map((m) => m.id === msg.id ? { ...m, feedback: next } : m) }));
    try { await api.feedback(active.id, msg.id, next); } catch (e) { notify(apiError(e).message); }
  };

  const focusMessage = (message) => setOpenCard({ msgId: message.id, pinId: message.pins?.[0]?.id });

  if (booting) return <div className="boot"><div className="spinner big" /></div>;
  if (!user) return <LoginScreen onLogin={login} onRegister={register} error={loginErr} busy={loginBusy} />;

  const messages = active?.messages || [];
  const busy = sending;
  const images = { A: active ? { src: active.images.A.src } : null, B: active?.images.B ? { src: active.images.B.src } : null };

  return (
    <div className="app" onKeyDown={(e) => e.key === 'Escape' && setOpenCard(null)}>
      <Canvas convKey={active?.id || 'none'} images={images} compare={compare} tool={tool} setTool={setTool}
        committed={committed} pending={pending} messages={messages} openCard={openCard} maxAttempts={cfg.maxAttempts}
        defaultBoxPx={settings.boxPx} showOldPins={settings.showOldPins}
        onAddPin={addPin} onUpdatePin={updatePin} onRemovePin={removePin} onPinClick={onPinClick}
        onCloseCard={() => setOpenCard(null)} onRetry={() => {}} onFeedback={feedback}
        onPickFile={(slot) => { pickSlot.current = slot; fileInput.current?.click(); }} onDropFile={(f) => handleFile(f)} dragging={dragging} setDragging={setDragging} />

      <Header user={user} convs={convs} active={active} onOpen={openConversation} onNew={newProject} onRename={rename} onDelete={remove}
        onNavigate={navigate} onLogout={logout} onInfo={setModal} />

      <HistoryDock disabled={!active} open={historyOpen} setOpen={setHistoryOpen} compare={compare} setCompare={setCompare}
        messages={messages} busy={busy} maxLen={cfg.maxQuestionLen} maxAttempts={cfg.maxAttempts}
        onAsk={(text) => ask(text, 'history')} onFocus={focusMessage} onRetry={() => {}} />

      <BottomBar hasImage={!!active} compare={compare} pendingCount={pending.length} busy={busy} maxLen={cfg.maxQuestionLen}
        onFile={(file) => handleFile(file)} onSend={(text) => ask(text, 'pins')} onClearPins={() => setPending([])} />

      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) handleFile(file, pickSlot.current); }} />

      {uploading && <div className="toast info"><div className="spinner" />در حال بارگذاری تصویر...</div>}
      {toast && <div className={`toast ${toast.kind}`} role="alert" onClick={() => setToast(null)}>{toast.message}</div>}

      {modal === 'profile' && <Modal title="پروفایل" onClose={() => setModal(null)}><dl className="kv"><div><dt>نام</dt><dd>{user.displayName}</dd></div><div><dt>نام کاربری</dt><dd dir="ltr">{user.username}</dd></div><div><dt>سطح کاربری</dt><dd>{user.level}</dd></div></dl></Modal>}
      {modal === 'subscription' && <Modal title="خرید یا تمدید اشتراک" onClose={() => setModal(null)}><p>پرداخت و اشتراک در این نسخه فعال نیست.</p></Modal>}
      {modal === 'settings' && <Modal title="تنظیمات" onClose={() => setModal(null)}>
        <label className="field">اندازهٔ کادر پیش‌فرض پین: {toFa(settings.boxPx)} پیکسل<input type="range" min="30" max="140" value={settings.boxPx} onChange={(e) => setSettings((s) => ({ ...s, boxPx: Number(e.target.value) }))} /></label>
        <label className="check"><input type="checkbox" checked={settings.showOldPins} onChange={(e) => setSettings((s) => ({ ...s, showOldPins: e.target.checked }))} />نمایش همیشگی پین‌های پرسش‌های قبلی</label>
      </Modal>}
    </div>
  );
}
