import React, { useEffect, useMemo, useRef, useState } from 'react';
import ImageNode from './ImageNode.jsx';
import AnswerCard from './AnswerCard.jsx';
import ToolRail from './ToolRail.jsx';
import { Icon } from './Icons.jsx';
import { useCanvasView } from '../hooks/useCanvasView.js';
import { toFa } from '../levels.js';

const MAX_W = 760, MAX_H = 520, GAP = 56;

function useImageSize(src) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    setSize(null);
    if (!src) return undefined;
    let alive = true;
    const i = new Image();
    i.onload = () => alive && setSize({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = src;
    return () => { alive = false; };
  }, [src]);
  return size;
}
const fitSize = (s, maxW = MAX_W, maxH = MAX_H) => { const f = Math.min(maxW / s.w, maxH / s.h, 1.5); return { w: Math.round(s.w * f), h: Math.round(s.h * f) }; };

export default function Canvas(props) {
  const { convKey, images, compare, tool, setTool, committed, pending, messages, openCard, maxAttempts, defaultBoxPx, showOldPins,
    onAddPin, onUpdatePin, onRemovePin, onPinClick, onCloseCard, onRetry, onFeedback, onPickFile, onDropFile, dragging, setDragging } = props;
  const wrap = useRef(null);
  const view = useCanvasView(wrap);
  const sizeA = useImageSize(images.A?.src);
  const sizeB = useImageSize(images.B?.src);
  const showB = compare && !!images.A;

  const rects = useMemo(() => {
    if (!sizeA) return {};
    const a = fitSize(sizeA);
    const out = {};
    if (showB) {
      const b = images.B && sizeB ? fitSize(sizeB, a.w, a.h) : { w: Math.round(a.w * 0.7), h: Math.round(a.h * 0.7) };
      out.A = { x: -a.w - GAP / 2, y: -a.h / 2, ...a };
      out.B = { x: GAP / 2, y: -b.h / 2, ...b };
    } else out.A = { x: -a.w / 2, y: -a.h / 2, ...a };
    return out;
  }, [sizeA, sizeB, showB, images.B]);

  const bounds = useMemo(() => {
    const rs = Object.values(rects);
    if (!rs.length) return null;
    return { x1: Math.min(...rs.map((r) => r.x)), y1: Math.min(...rs.map((r) => r.y)), x2: Math.max(...rs.map((r) => r.x + r.w)), y2: Math.max(...rs.map((r) => r.y + r.h)) };
  }, [rects]);
  const boundsKey = bounds ? `${convKey}|${showB}|${Object.values(bounds).join(',')}` : '';
  useEffect(() => { if (bounds) view.fit(bounds); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [boundsKey]);

  const allPins = useMemo(() => [...(showOldPins ? committed : committed.filter((p) => p.msgId === openCard?.msgId)), ...pending], [committed, pending, showOldPins, openCard]);
  const visible = allPins.filter((p) => p.image === 'A' || showB);
  const world = (p) => { const r = rects[p.image]; return r ? { x: r.x + p.cx * r.w, y: r.y + p.cy * r.h } : null; };

  // خطوط اتصال: پین‌های هم‌گروه به ترتیب شماره
  const links = useMemo(() => {
    const groups = {};
    visible.forEach((p) => { (groups[p.group || 'g'] ||= []).push(p); });
    const out = [];
    Object.values(groups).forEach((g) => {
      g.sort((a, b) => a.n - b.n);
      for (let i = 0; i < g.length - 1; i += 1) {
        const a = world(g[i]), b = world(g[i + 1]);
        if (a && b) out.push({ key: `${g[i].id}-${g[i + 1].id}`, a, b, cross: g[i].image !== g[i + 1].image, msgId: g[i].msgId });
      }
    });
    return out;
  }, [visible, rects]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardMsg = openCard ? messages.find((m) => m.id === openCard.msgId) : null;
  let anchor = null;
  if (cardMsg && rects.A) {
    const pin = cardMsg.pins.find((p) => p.id === openCard.pinId) || cardMsg.pins[0];
    if (pin && rects[pin.image]) { const r = rects[pin.image]; anchor = { x: r.x + (pin.box ? pin.box.x2 : pin.cx) * r.w, y: r.y + (pin.box ? pin.box.y1 : pin.cy) * r.h }; }
    else anchor = { x: rects.A.x + rects.A.w, y: rects.A.y };
  }

  const onDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    view.startPan(e, onCloseCard);
  };
  const empty = !images.A;
  const cursor = tool === 'hand' ? 'grab' : tool === 'pin' || tool === 'roi' ? 'crosshair' : 'default';

  return (
    <div className={`canvas-wrap ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onDropFile(f); }}>
      <div ref={wrap} className="canvas" onPointerDown={onDown} style={{ cursor, backgroundSize: `${28 * view.k}px ${28 * view.k}px`, backgroundPosition: `calc(50% + ${view.x}px) calc(50% + ${view.y}px)` }}>
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {rects.A && (
            <ImageNode slot="A" src={images.A.src} rect={rects.A} tool={tool} k={view.k} selectedPinId={openCard?.pinId}
              pins={visible.filter((p) => p.image === 'A')} defaultBoxPx={defaultBoxPx}
              onAddPin={onAddPin} onUpdatePin={onUpdatePin} onRemovePin={onRemovePin} onPinClick={onPinClick} />
          )}
          {rects.B && images.B && (
            <ImageNode slot="B" src={images.B.src} rect={rects.B} tool={tool} k={view.k} selectedPinId={openCard?.pinId}
              pins={visible.filter((p) => p.image === 'B')} defaultBoxPx={defaultBoxPx}
              onAddPin={onAddPin} onUpdatePin={onUpdatePin} onRemovePin={onRemovePin} onPinClick={onPinClick} />
          )}
          {rects.B && !images.B && (
            <button className="node dropslot" style={{ left: rects.B.x, top: rects.B.y, width: rects.B.w, height: rects.B.h }} onPointerDown={(e) => e.stopPropagation()} onClick={() => onPickFile('B')}>
              <span style={{ transform: `scale(${1 / view.k})` }}><Icon name="upload" size={26} /><b>تصویر B را بکشید یا کلیک کنید</b></span>
            </button>
          )}
          <svg className="links" width="1" height="1">
            {links.map((l) => {
              const sim = l.cross ? messages.find((m) => m.id === l.msgId)?.answer?.similarity : undefined;
              const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
              const w = 2.5 / view.k, d = `${9 / view.k} ${7 / view.k}`;
              return (
                <g key={l.key}>
                  {l.cross ? (
                    <>
                      <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#2dd4bf" strokeWidth={w} strokeDasharray={d} />
                      <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#fbbf24" strokeWidth={w} strokeDasharray={d} strokeDashoffset={8 / view.k} />
                    </>
                  ) : <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#cfc6ff" strokeWidth={w} opacity=".9" />}
                  {typeof sim === 'number' && (
                    <g transform={`translate(${mx} ${my}) scale(${1 / view.k})`}>
                      <rect x="-42" y="-13" width="84" height="26" rx="13" fill="#171934" stroke="#fbbf24" />
                      <text textAnchor="middle" dy="5" fontSize="12" fill="#fde68a" fontFamily="Vazirmatn Variable, sans-serif">تطابق {toFa(Math.round(sim))}٪</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          {cardMsg && anchor && (
            <AnswerCard msg={cardMsg} anchor={anchor} k={view.k} maxAttempts={maxAttempts} onClose={onCloseCard} onRetry={onRetry} onFeedback={onFeedback} />
          )}
        </div>
      </div>

      {empty && (
        <button className="empty-drop" onClick={() => onPickFile()}>
          <Icon name="upload" size={34} />
          <strong>تصویر خود را به اینجا بکشید (Drag &amp; Drop) یا کلیک کنید</strong>
          <span>JPG، PNG یا WEBP — سپس با پین‌گذاری روی تصویر، دربارهٔ هر بخش بپرسید</span>
        </button>
      )}
      <ToolRail tool={tool} setTool={setTool} onZoom={view.zoomBy} onFit={() => bounds && view.fit(bounds)} disabled={empty} />
      {dragging && <div className="drop-veil">برای بارگذاری، فایل را رها کنید</div>}
    </div>
  );
}
