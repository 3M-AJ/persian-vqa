import React from 'react';
import { Icon } from './Icons.jsx';

const TOOLS = [
  ['select', 'cursor', 'انتخاب'],
  ['hand', 'hand', 'ابزار جابجایی (دست)'],
  ['pin', 'pin', 'پین‌گذاری تعاملی'],
  ['roi', 'roi', 'برش محدوده (ROI)'],
];

export default function ToolRail({ tool, setTool, onZoom, onFit, disabled }) {
  return (
    <aside className="tool-rail glass" aria-label="ابزارهای تصویر">
      {TOOLS.map(([id, icon, label]) => (
        <button key={id} className={`icon-btn ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)} title={label} aria-label={label} aria-pressed={tool === id} disabled={disabled && id !== 'select' && id !== 'hand'}>
          <Icon name={icon} />
        </button>
      ))}
      <i className="sep" />
      <button className="icon-btn" onClick={() => onZoom(1.25)} title="بزرگ‌نمایی" aria-label="بزرگ‌نمایی"><Icon name="zoomIn" /></button>
      <button className="icon-btn" onClick={() => onZoom(0.8)} title="کوچک‌نمایی" aria-label="کوچک‌نمایی"><Icon name="zoomOut" /></button>
      <button className="icon-btn" onClick={onFit} title="جا دادن در صفحه" aria-label="جا دادن در صفحه"><Icon name="fit" /></button>
    </aside>
  );
}
