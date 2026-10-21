import React, { useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { useSpeech } from '../hooks/useSpeech.js';
import { LEVELS, guessLevel, toFa } from '../levels.js';

const SUGGEST_SINGLE = ['این چیست؟', 'چه رنگی است؟', 'چند عدد از این وجود دارد؟', 'متن داخل این ناحیه را بخوان'];
const SUGGEST_MULTI = ['رابطهٔ این‌ها چیست؟', 'کدام بزرگ‌تر است؟', 'کدام کنار کدام است؟'];
const SUGGEST_COMPARE = ['شباهت این دو ناحیه چقدر است؟', 'تفاوت این دو چیست؟'];

export default function BottomBar({ hasImage, compare, pendingCount, busy, maxLen, onFile, onSend, onClearPins }) {
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const speech = useSpeech((t) => setText((p) => `${p ? `${p} ` : ''}${t}`.slice(0, maxLen)));
  const level = guessLevel(text);
  const needMulti = LEVELS[level].multi && pendingCount < 2;
  const tooLong = text.length > maxLen;
  const canSend = !!text.trim() && !tooLong && !busy && pendingCount > 0;
  const chips = pendingCount >= 2 ? (compare ? SUGGEST_COMPARE : SUGGEST_MULTI) : SUGGEST_SINGLE;

  const send = () => { if (!canSend) return; onSend(text); setText(''); };
  const key = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } };

  return (
    <div className="bottom">
      {pendingCount > 0 ? (
        <div className="composer glass">
          <div className="chips">
            {chips.map((c) => <button key={c} className="chip-btn" onClick={() => setText(c)}>{c}</button>)}
            <button className="chip-btn ghost" onClick={onClearPins}>پاک‌کردن پین‌ها</button>
          </div>
          <div className="input-row">
            <textarea value={text} rows={1} onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="پرسش دربارهٔ تصویر یا پین فعال"
              placeholder="پرسش جدید خود را دربارهٔ تصویر یا پین فعال بنویسید..." />
            {speech.supported && <button className={`icon-btn mic ${speech.listening ? 'on rec' : ''}`} onClick={speech.toggle} aria-label="پرسش صوتی" title="پرسش صوتی (فارسی)"><Icon name="mic" /></button>}
            <button className="send" onClick={send} disabled={!canSend} aria-label="ارسال"><Icon name="send" size={18} className="flip-h" /></button>
          </div>
          <div className="hints">
            <span className="level-tag">سطح {toFa(level)} · {LEVELS[level].title}</span>
            {needMulti && <span className="warn">برای این نوع پرسش دو پین (یا بیشتر) متصل بگذارید.</span>}
            {tooLong && <span className="warn">پرسش بیش از {toFa(maxLen)} نویسه است.</span>}
            <span className="muted">Enter ارسال · Shift+Enter خط جدید</span>
          </div>
        </div>
      ) : (
        hasImage && <div className="hint-pill glass">با ابزار «پین» روی تصویر کلیک کنید تا دربارهٔ همان بخش بپرسید؛ یا از پنل تاریخچه بدون پین بپرسید.</div>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      <button className="upload-btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={20} /><span>آپلود تصویر جدید (A/B) / کشیدن فایل</span></button>
    </div>
  );
}
