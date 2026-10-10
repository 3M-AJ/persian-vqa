# -*- coding: utf-8 -*-
"""
Persian text processing and normalization utility for Persian VQA system.
Complies with Proposal specifications:
1. Unifying characters (Arabic yeh/kaf to Persian yeh/kaf).
2. Normalizing half-spaces (ZWNJ) and whitespaces.
3. Normalizing Arabic and Persian numerals.
4. Heuristic classification of question complexity levels (Level 1 to 4).
"""
import re
import unicodedata

# Mapping Arabic characters to Persian equivalents
ARABIC_TO_PERSIAN_MAP = {
    '\u064a': '\u06cc',  # Arabic yeh 'ي' -> Persian yeh 'ی'
    '\u0649': '\u06cc',  # Alef maksura 'ى' -> Persian yeh 'ی'
    '\u0643': '\u06a9',  # Arabic kaf 'ك' -> Persian kaf 'ک'
    '\u0629': '\u0647',  # Teh marbuta 'ة' -> heh 'ه'
    '\u06c0': '\u0647',  # Heh with yeh above -> heh 'ه'
    '\u0624': '\u0648',  # Waw with hamza 'ؤ' -> 'و'
    '\u0626': '\u06cc',  # Yeh with hamza 'ئ' -> 'ی'
}

# Arabic/Persian digits to standard digits
DIGIT_MAP = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

# Conversational to formal word mappings (expandable dictionary)
COLLOQUIAL_MAP = {
    'چنتا': 'چند تا',
    'چنتاس': 'چند تا است',
    'کجاس': 'کجا است',
    'چیه': 'چیست',
    'رنگش': 'رنگ آن',
    'اون': 'آن',
    'اینا': 'این‌ها',
    'اونا': 'آن‌ها',
    'سمت راستیه': 'سمت راستی',
    'سمت چپیه': 'سمت چپی',
}


def normalize_persian_text(text: str) -> str:
    """
    Cleans and standardizes Persian text without removing spatial or pointing pronouns.
    """
    if not text:
        return ""

    # Normalize unicode
    text = unicodedata.normalize('NFKC', text)

    # Replace Arabic characters with Persian equivalents
    for ar_char, fa_char in ARABIC_TO_PERSIAN_MAP.items():
        text = text.replace(ar_char, fa_char)

    # Standardize digits
    for num_char, std_num in DIGIT_MAP.items():
        text = text.replace(num_char, std_num)

    # Normalize Zero-Width Non-Joiner (ZWNJ \u200c)
    # Remove repeated ZWNJ
    text = re.sub(r'[\u200c\u200b\u200d]+', '\u200c', text)
    # Remove ZWNJ after non-joining characters or at boundary
    text = re.sub(r'[\s\n\r]+', ' ', text)
    text = re.sub(r' \u200c|\u200c ', ' ', text)

    # Apply colloquial dictionary where appropriate (word boundary aware)
    words = text.split()
    normalized_words = [COLLOQUIAL_MAP.get(w, w) for w in words]
    text = ' '.join(normalized_words)

    # Clean redundant punctuation while preserving question marks
    text = re.sub(r'[؟?]+', '؟', text)
    text = text.strip()
    return text


def detect_question_level(question: str) -> int:
    """
    Classifies question complexity into Level 1 to Level 4 according to Proposal:
    Level 1: Simple object, color, or single attribute detection.
    Level 2: Counting elements.
    Level 3: Spatial and comparative relationships between multiple objects.
    Level 4: Multi-step reasoning or text reading (OCR).
    """
    q_norm = normalize_persian_text(question.lower())

    # Level 2 Keywords (Counting)
    counting_keywords = [
        'چند', 'تعداد', 'شمارش', 'شمار', 'how many', 'count', 'number of'
    ]
    if any(k in q_norm for k in counting_keywords):
        return 2

    # Level 4 Keywords (OCR / Multi-step Reasoning / Why / How)
    level4_keywords = [
        'متن', 'نوشته', 'خوان', 'تابلو', 'پلاک', 'فاکتور', 'چرا', 'علت', 'دلیل',
        'استدلال', 'نتیجه', 'text', 'read', 'ocr', 'written', 'why', 'reason', 'explain why'
    ]
    if any(k in q_norm for k in level4_keywords):
        return 4

    # Level 3 Keywords (Relationships / Spatial / Comparison)
    level3_keywords = [
        'کنار', 'پشت', 'جلو', 'روی', 'زیر', 'بین', 'سمت راست', 'سمت چپ', 'بالای', 'پایین',
        'بزرگتر', 'کوچکتر', 'بلندتر', 'نزدیکتر', 'دورتر', 'نسبت به', 'مقایسه',
        'next to', 'beside', 'behind', 'in front', 'on top', 'under', 'between',
        'right of', 'left of', 'larger', 'smaller', 'closer', 'compare'
    ]
    if any(k in q_norm for k in level3_keywords):
        return 3

    # Default to Level 1 (Simple detection: what is this, what color, etc.)
    return 1
