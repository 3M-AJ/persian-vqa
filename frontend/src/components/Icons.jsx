import React from 'react';

const P = {
  down: <path d="M6 9l6 6 6-6" />,
  right: <path d="M9 6l6 6-6 6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  upload: <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  send: <path d="M4 12l16-8-6 16-2-7-8-1z" />,
  hand: <path d="M8 12V6a1.5 1.5 0 013 0v5m0-1V4.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-3.5a1.5 1.5 0 012.4-1.7L8 14" />,
  pin: <><path d="M12 21s-6-5.2-6-10a6 6 0 0112 0c0 4.8-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></>,
  roi: <><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><rect x="9" y="9" width="6" height="6" rx="1" /></>,
  cursor: <path d="M5 4l14 6-6 2-2 6z" />,
  zoomIn: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4M8 11h6" /></>,
  fit: <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />,
  history: <><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5" /><path d="M3 4v4h4M12 8v5l3 2" /></>,
  compare: <><rect x="3" y="5" width="8" height="14" rx="1.5" /><rect x="13" y="5" width="8" height="14" rx="1.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  logout: <><path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  like: <path d="M7 11v9H4v-9h3zm0 0l4-7a2 2 0 012 2v4h5a2 2 0 012 2.3l-1 6A2 2 0 0117 20H7" />,
  dislike: <path d="M7 13V4H4v9h3zm0 0l4 7a2 2 0 002-2v-4h5a2 2 0 002-2.3l-1-6A2 2 0 0017 4H7" />,
  retry: <><path d="M20 12a8 8 0 11-2.6-5.9" /><path d="M20 4v5h-5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3" /></>,
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#7c5cff" />
      <path d="M8 12V9a1 1 0 011-1h3M20 8h3a1 1 0 011 1v3M24 20v3a1 1 0 01-1 1h-3M12 24H9a1 1 0 01-1-1v-3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" fill="#2dd4bf" />
    </svg>
  );
}
