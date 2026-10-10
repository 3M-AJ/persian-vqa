# -*- coding: utf-8 -*-
"""
End-to-End Integration Tests for Persian VQA Backend:
- Tests /health, /api/stats
- Tests /api/vqa/analyze (Multipart/form-data image upload + Persian query)
- Tests follow-up conversation /api/conversations/{id}/messages
- Tests message rating /api/messages/{id}/rate
- Tests listing and detail of conversations
- Tests deletion of conversation
"""
import io
import os
import unittest
from PIL import Image
from fastapi.testclient import TestClient

from app import app
from database import init_db

client = TestClient(app)


class TestPersianVQAIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_01_health_and_stats(self):
        resp = client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("device_info", data)

        resp_stats = client.get("/api/stats")
        self.assertEqual(resp_stats.status_code, 200)
        sdata = resp_stats.json()
        self.assertIn("total_conversations", sdata)
        self.assertIn("total_questions", sdata)

    def test_02_vqa_flow(self):
        # Create a mock image
        img = Image.new("RGB", (640, 480), color=(30, 120, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        image_bytes = buf.getvalue()

        # 1. Analyze initial image with Persian question
        resp = client.post(
            "/api/vqa/analyze",
            files={"image": ("test_blue.jpg", image_bytes, "image/jpeg")},
            data={"question": "رنگ غالب در این تصویر چیست؟", "level": 1}
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        res_data = resp.json()
        self.assertIn("conversation_id", res_data)
        self.assertIn("message_id", res_data)
        self.assertIn("answer", res_data)
        self.assertIn("confidence", res_data)
        self.assertIn("evidence", res_data)
        self.assertEqual(res_data["level"], 1)

        conv_id = res_data["conversation_id"]
        msg_id = res_data["message_id"]

        # 2. Rate message
        resp_rate = client.post(f"/api/messages/{msg_id}/rate", json={"rating": 1})
        self.assertEqual(resp_rate.status_code, 200)
        self.assertEqual(resp_rate.json()["rating"], 1)

        # 3. Follow-up question on same image
        resp_followup = client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"question": "عنصر سمت راست را با دقت بیشتری بگو", "level": 3}
        )
        self.assertEqual(resp_followup.status_code, 200, resp_followup.text)
        f_data = resp_followup.json()
        self.assertEqual(f_data["conversation_id"], conv_id)
        self.assertIn("answer", f_data)

        # 4. Get conversation details
        resp_conv = client.get(f"/api/conversations/{conv_id}")
        self.assertEqual(resp_conv.status_code, 200)
        cdetail = resp_conv.json()
        self.assertEqual(len(cdetail["messages"]), 4)  # user1, asst1, user2, asst2

        # 5. List conversations
        resp_list = client.get("/api/conversations")
        self.assertEqual(resp_list.status_code, 200)
        items = resp_list.json()
        self.assertTrue(any(item["id"] == conv_id for item in items))

        # 6. Delete conversation
        resp_del = client.delete(f"/api/conversations/{conv_id}")
        self.assertEqual(resp_del.status_code, 200)

        # Verify 404 after deletion
        resp_check = client.get(f"/api/conversations/{conv_id}")
        self.assertEqual(resp_check.status_code, 404)

    def test_03_frontend_static_serving(self):
        resp = client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("html", resp.headers.get("content-type", "").lower())
        self.assertIn("سامانه پرسش و پاسخ تصویری", resp.text)


if __name__ == "__main__":
    unittest.main()
