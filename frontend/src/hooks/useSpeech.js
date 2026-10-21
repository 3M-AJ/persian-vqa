import { useCallback, useEffect, useRef, useState } from 'react';

/** تبدیل گفتار به متن با Web Speech API (Chrome/Edge). توجه: صدا برای تشخیص به سرویس مرورگر ارسال می‌شود. */
export function useSpeech(onText, lang = 'fa-IR') {
  const Ctor = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => () => rec.current?.abort?.(), []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = lang; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => cb.current(Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [Ctor, listening, lang]);

  return { supported: !!Ctor, listening, toggle };
}
