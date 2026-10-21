import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** وضعیت بوم: جابجایی (Pan) و بزرگ‌نمایی (Zoom). مبدأ دنیا مرکز عنصر بوم است. */
export function useCanvasView(ref) {
  const [v, setV] = useState({ x: 0, y: 0, k: 1 });
  const vRef = useRef(v);
  vRef.current = v;

  const zoomAt = useCallback((cx, cy, factor) => {
    setV((p) => {
      const k = clamp(p.k * factor, 0.12, 6);
      const f = k / p.k;
      return { k, x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.target.closest?.('.no-zoom')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, zoomAt]);

  /** شروع جابجایی؛ onClick زمانی صدا زده می‌شود که کاربر تقریباً حرکتی نکرده باشد. */
  const startPan = useCallback((e, onClick) => {
    const sx = e.clientX, sy = e.clientY, base = vRef.current;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.hypot(dx, dy) > 4) moved = true;
      setV({ ...base, x: base.x + dx, y: base.y + dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved && onClick) onClick();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const zoomBy = useCallback((factor) => zoomAt(0, 0, factor), [zoomAt]);

  const fit = useCallback((b) => {
    const el = ref.current;
    if (!el || !b) return;
    const r = el.getBoundingClientRect();
    const bw = Math.max(1, b.x2 - b.x1), bh = Math.max(1, b.y2 - b.y1);
    const k = clamp(Math.min((r.width * 0.78) / bw, (r.height * 0.62) / bh), 0.12, 1.6);
    setV({ k, x: -((b.x1 + b.x2) / 2) * k, y: -((b.y1 + b.y2) / 2) * k - 14 });
  }, [ref]);

  return { ...v, startPan, zoomBy, fit };
}
