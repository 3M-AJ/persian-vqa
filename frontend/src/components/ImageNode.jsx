import React, { useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { pinColor, toFa } from '../levels.js';

const clamp = (v) => Math.min(1, Math.max(0, v));
const CORNERS = [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]];

function PinView({ pin, k, nodeRef, selected, onClick, onUpdate, onRemove }) {
  const col = pinColor(pin.n);
  const b = pin.box;
  const resize = (corner) => (e) => {
    e.stopPropagation(); e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const { x1, y1, x2, y2 } = b;
    const move = (ev) => {
      const r = nodeRef.current.getBoundingClientRect();
      const x = clamp((ev.clientX - r.left) / r.width), y = clamp((ev.clientY - r.top) / r.height);
      const nb = { x1, y1, x2, y2 };
      if (corner.includes('l')) nb.x1 = Math.min(x, x2 - 0.01); else nb.x2 = Math.max(x, x1 + 0.01);
      if (corner.includes('t')) nb.y1 = Math.min(y, y2 - 0.01); else nb.y2 = Math.max(y, y1 + 0.01);
      onUpdate(pin.id, { box: nb, cx: (nb.x1 + nb.x2) / 2, cy: (nb.y1 + nb.y2) / 2 });
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const stop = (e) => e.stopPropagation();

  return (
    <>
      {b && (
        <div className={`pin-box ${pin.pending ? 'pending' : 'sent'} ${pin.auto ? 'auto' : ''} ${selected ? 'sel' : ''}`}
          style={{ left: `${b.x1 * 100}%`, top: `${b.y1 * 100}%`, width: `${(b.x2 - b.x1) * 100}%`, height: `${(b.y2 - b.y1) * 100}%`, borderColor: col, borderWidth: 2 / k, background: `${col}1f` }}>
          {pin.pending && CORNERS.map(([c, hx, hy]) => (
            <i key={c} className="handle" style={{ left: `${hx * 100}%`, top: `${hy * 100}%`, width: 11 / k, height: 11 / k, borderColor: col, borderWidth: 1.5 / k, cursor: c === 'tl' || c === 'br' ? 'nwse-resize' : 'nesw-resize' }}
              onPointerDown={resize(c)} />
          ))}
        </div>
      )}
      <button className={`pin ${pin.pending ? 'pending' : ''} ${selected ? 'sel' : ''}`} aria-label={`پین ${pin.n}`}
        style={{ left: `${pin.cx * 100}%`, top: `${pin.cy * 100}%`, background: col, transform: `translate(-50%,-50%) scale(${1 / k})` }}
        onPointerDown={stop} onClick={() => onClick(pin)}>{toFa(pin.n)}</button>
      {pin.pending && (
        <button className="pin-x" aria-label="حذف پین" style={{ left: `${(b ? b.x2 : pin.cx) * 100}%`, top: `${(b ? b.y1 : pin.cy) * 100}%`, transform: `translate(-50%,-110%) scale(${1 / k})` }}
          onPointerDown={stop} onClick={() => onRemove(pin.id)}><Icon name="x" size={12} /></button>
      )}
    </>
  );
}

export default function ImageNode({ slot, src, rect, tool, k, pins, selectedPinId, defaultBoxPx, onAddPin, onUpdatePin, onRemovePin, onPinClick }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [ghost, setGhost] = useState(null);

  const norm = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height), r };
  };
  const active = tool === 'pin' || tool === 'roi';
  const down = (e) => {
    if (!active || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = norm(e);
    drag.current = { x0: p.x, y0: p.y, moved: false };
    if (tool === 'roi') setGhost({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = norm(e);
    if (Math.hypot((p.x - d.x0) * p.r.width, (p.y - d.y0) * p.r.height) > 5) d.moved = true;
    if (tool === 'roi' && d.moved) setGhost({ x1: Math.min(d.x0, p.x), y1: Math.min(d.y0, p.y), x2: Math.max(d.x0, p.x), y2: Math.max(d.y0, p.y) });
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = norm(e);
    if (tool === 'pin' && !d.moved) {
      // کادر پیش‌فرض به‌جای نقطهٔ صفر‌بعدی (BBox over Point)
      const bw = defaultBoxPx / rect.w / 2, bh = defaultBoxPx / rect.h / 2;
      onAddPin({ image: slot, cx: p.x, cy: p.y, box: { x1: clamp(p.x - bw), y1: clamp(p.y - bh), x2: clamp(p.x + bw), y2: clamp(p.y + bh) } });
    }
    if (tool === 'roi') {
      const g = ghost;
      setGhost(null);
      if (d.moved && g && g.x2 - g.x1 > 0.01 && g.y2 - g.y1 > 0.01) onAddPin({ image: slot, cx: (g.x1 + g.x2) / 2, cy: (g.y1 + g.y2) / 2, box: g });
    }
  };

  return (
    <div className="node" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <span className="node-tag" style={{ transform: `scale(${1 / k})` }}>تصویر {slot}</span>
      <div className="node-frame" ref={ref}>
        <img src={src} alt={`تصویر ${slot}`} draggable="false" />
        <div className={`hit ${active ? 'active' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setGhost(null); }} />
        {pins.map((p) => (
          <PinView key={p.id} pin={p} k={k} nodeRef={ref} selected={p.id === selectedPinId} onClick={onPinClick} onUpdate={onUpdatePin} onRemove={onRemovePin} />
        ))}
        {ghost && <div className="pin-box ghost" style={{ left: `${ghost.x1 * 100}%`, top: `${ghost.y1 * 100}%`, width: `${(ghost.x2 - ghost.x1) * 100}%`, height: `${(ghost.y2 - ghost.y1) * 100}%`, borderWidth: 2 / k }} />}
      </div>
    </div>
  );
}
