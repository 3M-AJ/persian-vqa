import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { useSpeech } from '../hooks/useSpeech.js';
import { toFa } from '../levels.js';

const CONF = { 'مطمئن': 'ok', 'نسبتاً مطمئن': 'mid', 'نامطمئن': 'low' };

/** زیر هدر، سمت راست: دکمهٔ تاریخچه + کلید حالت مقایسه + جزیرهٔ عمومی گفتگو با اسکرول عمودی */
export default function HistoryDock({ disabled, open, setOpen, compare, setCompare, messages, busy, maxLen, maxAttempts, onAsk, onFocus, onRetry }) {
  const [text, setText] = useState('');
  const list = useRef(null);
  const speech = useSpeech((t) => setText((p) => `${p ? `${p} ` : ''}${t}`.slice(0, maxLen)));
  useEffect(() => { if (open) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [open, messages.length, messages.at(-1)?.status]);

  const canSend = !!text.trim() && text.length <= maxLen && !busy && !disabled;
  const send = () => { if (canSend) { onAsk(text); setText(''); } };

  return (
    <div className="dock">
      <div className="dock-btns">
        <button className={`dock-btn glass ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} disabled={disabled} aria-pressed={open} title="تاریخچه گفتگو"><Icon name="history" /><span>تاریخچه</span></button>
        <button className={`dock-btn glass ${compare ? 'on' : ''}`} onClick={() => setCompare(!compare)} disabled={disabled} aria-pressed={compare} title="مقایسهٔ دو تصویر"><Icon name="compare" /><span>{compare ? 'مقایسه فعال' : 'تک‌تصویر'}</span></button>
      </div>
      {open && (
        <section className="island history glass" aria-label="تاریخچه گفتگو">
          <div className="hist-list" ref={list}>
            {!messages.length && <p className="empty-note">هنوز پرسشی ثبت نشده است. بدون پین‌گذاری هم می‌توانید بپرسید؛ پین‌ها خودکار روی تصویر قرار می‌گیرند.</p>}
            {messages.map((m) => (
              <article key={m.id} className="turn">
                <button className="bubble user" onClick={() => onFocus(m)}>
                  <p>{m.question}</p>
                  <small>{m.pins.length ? (m.pins.some((p) => p.auto) ? `پین خودکار: ${m.pins.map((p) => toFa(p.n)).join('، ')}` : `پین ${m.pins.map((p) => toFa(p.n)).join('، ')}`) : 'بدون پین'}{m.mode === 'compare' ? ' · مقایسه' : ''}</small>
                </button>
                <div className="bubble bot">
                  {m.status === 'processing' && <div className="status"><div className="spinner" /><span>{m.stageText || 'در حال پردازش...'}</span></div>}
                  {m.status === 'failed' && (
                    <div className="status failed"><p>{m.error?.message}</p>
                      {m.error?.retryable && m.attempts < maxAttempts && <button className="btn-small" onClick={() => onRetry(m)}><Icon name="retry" size={14} />تلاش مجدد</button>}
                    </div>
                  )}
                  {m.status === 'done' && m.answer && (<><p dir="auto">{m.answer.answer}</p><span className={`chip ${CONF[m.answer.confidence] || 'mid'}`}>{m.answer.confidence}</span></>)}
                </div>
              </article>
            ))}
          </div>
          <div className="hist-input">
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="بدون پین‌گذاری بپرسید..." aria-label="پرسش بدون پین"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            {speech.supported && <button className={`icon-btn ${speech.listening ? 'on rec' : ''}`} onClick={speech.toggle} aria-label="پرسش صوتی"><Icon name="mic" size={17} /></button>}
            <button className="send sm" onClick={send} disabled={!canSend} aria-label="ارسال"><Icon name="send" size={16} className="flip-h" /></button>
          </div>
        </section>
      )}
    </div>
  );
}
