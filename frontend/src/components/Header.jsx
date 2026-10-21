import React, { useEffect, useRef, useState } from 'react';
import { Icon, Logo } from './Icons.jsx';
import { imageSrc } from '../api.js';

/**
 * راست: نماد و نام سامانه | وسط: نام گفتگو + فلش‌ها + جزیرهٔ گفتگوها | چپ: نمایهٔ کاربر + جزیرهٔ منو
 */
export default function Header({ user, convs, active, onOpen, onNew, onRename, onDelete, onNavigate, onLogout, onInfo }) {
  const [menu, setMenu] = useState(false);
  const [strip, setStrip] = useState(false);
  const root = useRef(null);
  const stripRef = useRef(null);

  useEffect(() => {
    const away = (e) => { if (root.current && !root.current.contains(e.target)) { setMenu(false); setStrip(false); } };
    const esc = (e) => { if (e.key === 'Escape') { setMenu(false); setStrip(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, []);

  useEffect(() => {
    if (strip) stripRef.current?.querySelector('.strip-card.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [strip]);

  const idx = convs.findIndex((c) => c.id === active?.id);
  const initial = (user.displayName || user.username || '?').trim().charAt(0);

  return (
    <header className="header" ref={root}>
      <div className="brand">
        <Logo />
        <div className="brand-text"><strong>پرسش و پاسخ تصویری</strong><span>VQA Workbench</span></div>
      </div>

      <div className="title-zone">
        <button className="icon-btn" onClick={() => onNavigate(-1)} disabled={idx <= 0} aria-label="گفتگوی قبلی" title="گفتگوی قبلی"><Icon name="right" /></button>
        <div className="title-wrap">
          <button className="title-btn glass" onClick={() => setStrip((s) => !s)} aria-expanded={strip}
            onDoubleClick={() => active && onRename(active)} title="برای تغییر نام دوبار کلیک کنید">
            <span>{active ? active.title : 'بدون گفتگو'}</span><Icon name="down" size={16} className={strip ? 'flip' : ''} />
          </button>
          {strip && (
            <div className="island strip glass" ref={stripRef} role="listbox" aria-label="گفتگوها">
              <button className="strip-card new" onClick={() => { onNew(); setStrip(false); }}><Icon name="plus" size={22} /><span>پروژهٔ جدید</span></button>
              {convs.map((c) => (
                <div key={c.id} className={`strip-card ${c.id === active?.id ? 'active' : ''}`} role="option" aria-selected={c.id === active?.id}>
                  <button className="strip-open" onClick={() => { onOpen(c.id); setStrip(false); }}>
                    <img src={imageSrc(c.image)} alt="" draggable="false" /><span>{c.title}</span>
                  </button>
                  <button className="strip-del icon-btn" onClick={() => onDelete(c)} aria-label="حذف گفتگو" title="حذف"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              {!convs.length && <div className="strip-empty">هنوز گفتگویی ندارید؛ یک تصویر بارگذاری کنید.</div>}
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={() => onNavigate(1)} disabled={idx === -1 || idx >= convs.length - 1} aria-label="گفتگوی بعدی" title="گفتگوی بعدی"><Icon name="left" /></button>
      </div>

      <div className="profile-zone">
        <button className="profile-btn glass" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          <span className="avatar">{initial}</span><span className="pname">{user.displayName}</span><Icon name="down" size={16} className={menu ? 'flip' : ''} />
        </button>
        {menu && (
          <div className="island menu glass" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); onInfo('profile'); }}><Icon name="user" /><span>مشاهدهٔ پروفایل</span><em className="level-chip">{user.level}</em></button>
            <button role="menuitem" onClick={() => { setMenu(false); onInfo('subscription'); }}><Icon name="card" /><span>خرید یا تمدید اشتراک</span></button>
            <button role="menuitem" onClick={() => { setMenu(false); onInfo('settings'); }}><Icon name="gear" /><span>تنظیمات</span></button>
            <button role="menuitem" className="danger" onClick={() => { setMenu(false); onLogout(); }}><Icon name="logout" /><span>خروج</span></button>
          </div>
        )}
      </div>
    </header>
  );
}
