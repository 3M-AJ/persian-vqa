// حدس سطح پرسش (۱ تا ۴) — هم‌خوان با model-service/app/text_utils.py
const L2 = ['چند', 'تعداد', 'شمار', 'how many', 'count', 'number of'];
const L3 = ['کنار', 'بالای', 'پایین', 'زیر', 'روبه‌رو', 'روبرو', 'بین', 'نسبت به', 'بزرگ‌تر', 'بزرگتر', 'کوچک‌تر', 'کوچکتر', 'رابطه', 'مقایسه', 'فاصله',
  'next to', 'left of', 'right of', 'between', 'bigger', 'larger', 'smaller', 'compare', 'relationship', 'relation', 'above', 'below'];
const L4 = ['چرا', 'اگر', 'استدلال', 'چه می‌شود', 'چه میشود', 'متن', 'بخوان', 'بنویس', 'استخراج', 'نمودار', 'why', 'reason', 'read', 'text', 'extract', 'chart', 'what would happen'];

export function guessLevel(text) {
  const t = (text || '').toLowerCase();
  for (const [words, level] of [[L4, 4], [L3, 3], [L2, 2]]) if (words.some((w) => t.includes(w))) return level;
  return 1;
}

export const LEVELS = {
  1: { title: 'تشخیص ساده', multi: false },
  2: { title: 'شمارش', multi: false },
  3: { title: 'روابط', multi: true },
  4: { title: 'استدلال چندمرحله‌ای', multi: true },
};

export const toFa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const PIN_COLORS = ['#7c5cff', '#2dd4bf', '#fbbf24', '#f472b6', '#60a5fa', '#34d399'];
export const pinColor = (n) => PIN_COLORS[(n - 1) % PIN_COLORS.length];
