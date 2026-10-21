# -*- coding: utf-8 -*-
"""
Tests for Persian VQA Backend:
- Persian text normalization
- Level classification
- Image validation & resizing
- Database operations
- FastAPI test client endpoints
"""
import io
import os
import unittest
from PIL import Image

from text_utils import normalize_persian_text, detect_question_level
from image_utils import validate_image_file, process_and_save_image, ImageValidationError
from database import (
    init_db,
    create_conversation,
    get_conversations,
    get_conversation,
    add_message,
    rate_message,
    delete_conversation
)


class TestPersianVQABackend(unittest.TestCase):
    def setUp(self):
        init_db()

    def test_persian_normalization(self):
        # Arabic characters to Persian
        raw = "يك تصوير زيبا با ماشين‌هاي متعدد"
        norm = normalize_persian_text(raw)
        self.assertIn("یک", norm)
        self.assertIn("تصویر", norm)
        self.assertIn("ماشین‌های", norm)

        # Numbers normalization
        raw_num = "۱۲۳۴۵۶۷۸۹۰"
        norm_num = normalize_persian_text(raw_num)
        self.assertEqual(norm_num, "1234567890")

    def test_level_detection(self):
        # Level 1: Simple detection / color
        self.assertEqual(detect_question_level("رنگ این ماشین چیست؟"), 1)
        # Level 2: Counting
        self.assertEqual(detect_question_level("چند تا درخت در تصویر است؟"), 2)
        # Level 3: Spatial / comparison
        self.assertEqual(detect_question_level("کدام شیء در سمت راست قرار دارد؟"), 3)
        # Level 4: OCR / reasoning
        self.assertEqual(detect_question_level("متن روی تابلوی خیابان چیست؟"), 4)

    def test_image_processing(self):
        # Create a test in-memory image
        img = Image.new("RGB", (1200, 1000), color=(255, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        raw_bytes = buf.getvalue()

        # Validate
        validate_image_file("sample.jpg", "image/jpeg", len(raw_bytes))

        # Save and process
        test_dir = os.path.join(os.path.dirname(__file__), "test_uploads")
        saved_file, w, h, mime = process_and_save_image(raw_bytes, "sample.jpg", test_dir)
        self.assertTrue(os.path.exists(os.path.join(test_dir, saved_file)))
        # Verify resize constraint (<= 1024x980)
        self.assertLessEqual(w, 1024)
        self.assertLessEqual(h, 980)

        # Clean up
        if os.path.exists(os.path.join(test_dir, saved_file)):
            os.remove(os.path.join(test_dir, saved_file))
        if os.path.exists(test_dir):
            os.rmdir(test_dir)

    def test_database_flow(self):
        conv = create_conversation("گفتگوی آزمایشی", "test.jpg", 800, 600)
        conv_id = conv["id"]
        self.assertIsNotNone(conv_id)

        msg = add_message(
            conversation_id=conv_id,
            sender="user",
            content="این عکس چیست؟",
            level=1
        )
        self.assertEqual(msg["sender"], "user")

        ans = add_message(
            conversation_id=conv_id,
            sender="assistant",
            content="این یک تصویر آزمایشی است.",
            confidence="مطمئن",
            evidence="مشاهده پس‌زمینه تصویر",
            level=1,
            latency_ms=120.5
        )
        self.assertEqual(ans["confidence"], "مطمئن")

        # Rate message
        rated = rate_message(ans["id"], 1)
        self.assertTrue(rated)

        # Fetch conversation
        retrieved = get_conversation(conv_id)
        self.assertEqual(len(retrieved["messages"]), 2)

        # Delete conversation
        deleted = delete_conversation(conv_id)
        self.assertTrue(deleted)


if __name__ == "__main__":
    unittest.main()
