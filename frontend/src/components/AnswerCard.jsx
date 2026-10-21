import React from 'react';
import { Icon } from './Icons.jsx';
import { toFa } from '../levels.js';

const STEPS = ['receiving', 'preparing', 'sending', 'analyzing', 'structuring', 'done'];
const CONF_CLASS = { 'مطمئن': 'ok', 'نسبتاً مطمئن': 'mid', 'نامطمئن': 'low' };
const NOTES = {
  inconsistent_samples: 'پاسخ‌های آزمایشی ناهمخوان بودند؛ نتیجه را با احتیاط بخوانید.',
  resolution_reduced_after_oom: 'برای کمبود حافظه، وضوح تصویر کاهش یافت.',
  invalid_json_from_model: 'مدل قالب خروجی را کامل رعایت نکرد.',
};

/** کارت پاسخ شناور؛ در دنیای بوم قرار می‌گیرد اما با scale(1/k) اندازهٔ ثابت روی صفحه دارد. */
export default function AnswerCard({ msg, anchor, k, maxAttempts, onClose, onRetry, onFeedback }) {
  const a = msg.answer;
  const step = Math.max(0, STEPS.indexOf(msg.stage));
  const copy = () => navigator.clipboard?.writeText(a?.answer || '');
  const rows = a ? [['شیء هدف', a.target_object], ['موقعیت در صحنه', a.scene_position]].filter(([, v]) => v) : [];

  return (
    <div className="answer-card glass no-zoom" style={{ left: anchor.x + 18 / k, top: anchor.y - 8 / k, transform: `scale(${1 / k})` }}
      onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="پاسخ سامانه">
      <header>
        <p className="q">{msg.question}</p>
        <button className="icon-btn" onClick={onClose} aria-label="بستن"><Icon name="x" size={16} /></button>
      </header>

      {msg.status === 'processing' && (
        <div className="status">
          <div className="spinner" /><span>{msg.stageText || 'در حال پردازش...'}</span>
          <div className="bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>
      )}

      {msg.status === 'failed' && (
        <div className="status failed">
          <p>{msg.error?.message || 'پردازش ناموفق بود.'}</p>
          {msg.error?.retryable && msg.attempts < maxAttempts && (
            <button className="btn-small" onClick={() => onRetry(msg)}><Icon name="retry" size={15} />تلاش مجدد ({toFa(msg.attempts)} از {toFa(maxAttempts)})</button>
          )}
        </div>
      )}

      {msg.status === 'done' && a && (
        <>
          {rows.length > 0 && <dl className="rows">{rows.map(([t, v]) => <div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}</dl>}
          <p className="answer" dir="auto">{a.answer}</p>
          <div className="meta">
            <span className={`chip ${CONF_CLASS[a.confidence] || 'mid'}`}>{a.confidence}</span>
            {typeof a.similarity === 'number' && <span className="chip sim">تطابق {toFa(Math.round(a.similarity))}٪</span>}
            {msg.level && <span className="chip">سطح {toFa(msg.level)}</span>}
          </div>
          {a.evidence && <p className="evidence"><b>شاهد:</b> {a.evidence}</p>}
          {(msg.warnings || []).filter((w) => NOTES[w]).map((w) => <p key={w} className="note">{NOTES[w]}</p>)}
          <footer>
            <button className="icon-btn" onClick={copy} title="کپی پاسخ" aria-label="کپی پاسخ"><Icon name="copy" size={16} /></button>
            <button className={`icon-btn ${msg.feedback === 'like' ? 'on' : ''}`} onClick={() => onFeedback(msg, 'like')} title="پسندیدم" aria-label="پسندیدم"><Icon name="like" size={16} /></button>
            <button className={`icon-btn ${msg.feedback === 'dislike' ? 'on bad' : ''}`} onClick={() => onFeedback(msg, 'dislike')} title="نپسندیدم" aria-label="نپسندیدم"><Icon name="dislike" size={16} /></button>
            {msg.latencyMs ? <span className="latency">{toFa((msg.latencyMs / 1000).toFixed(1))} ثانیه</span> : null}
          </footer>
        </>
      )}
    </div>
  );
}
