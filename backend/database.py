# -*- coding: utf-8 -*-
"""
Database layer for Persian VQA system using SQLite.
Stores conversations, messages, images, queries, processing status, and latencies.
"""
import os
import sqlite3
import uuid
from datetime import datetime, timezone

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "vqa_database.sqlite"))


from contextlib import contextmanager

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Initializes the database schema if tables do not exist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                image_filename TEXT NOT NULL,
                image_width INTEGER,
                image_height INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender TEXT NOT NULL, -- 'user' or 'assistant'
                content TEXT NOT NULL,
                confidence TEXT,      -- 'مطمئن', 'نسبتاً مطمئن', 'نامطمئن'
                evidence TEXT,        -- grounding evidence or visual citation
                level INTEGER,        -- 1, 2, 3, or 4
                latency_ms REAL,      -- inference time in milliseconds
                status TEXT DEFAULT 'completed', -- 'completed', 'failed', 'processing'
                rating INTEGER DEFAULT 0,        -- 1 (thumbs up), -1 (thumbs down), 0
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
        """)
        conn.commit()


def create_conversation(title: str, image_filename: str, width: int = 0, height: int = 0) -> dict:
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO conversations (id, title, image_filename, image_width, image_height, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (conv_id, title, image_filename, width, height, now, now)
        )
        conn.commit()
    return get_conversation(conv_id)


def get_conversations(limit: int = 50) -> list[dict]:
    with get_db() as conn:
        cursor = conn.execute(
            """
            SELECT c.*, 
                   (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
                   (SELECT m.content FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'assistant' ORDER BY m.created_at DESC LIMIT 1) AS last_answer
            FROM conversations c
            ORDER BY c.updated_at DESC
            LIMIT ?
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_conversation(conv_id: str) -> dict | None:
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        conv_row = cursor.fetchone()
        if not conv_row:
            return None
        
        conv = dict(conv_row)
        cursor = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conv_id,)
        )
        conv["messages"] = [dict(m) for m in cursor.fetchall()]
        return conv


def delete_conversation(conv_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        conn.commit()
        return cursor.rowcount > 0


def add_message(
    conversation_id: str,
    sender: str,
    content: str,
    confidence: str | None = None,
    evidence: str | None = None,
    level: int | None = None,
    latency_ms: float = 0.0,
    status: str = "completed"
) -> dict:
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, sender, content, confidence, evidence, level, latency_ms, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, conversation_id, sender, content, confidence, evidence, level, latency_ms, status, now)
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id)
        )
        conn.commit()
        
        cursor = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        return dict(cursor.fetchone())


def rate_message(message_id: str, rating: int) -> bool:
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE messages SET rating = ? WHERE id = ?",
            (rating, message_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_system_stats() -> dict:
    with get_db() as conn:
        total_convs = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        total_msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        avg_latency = conn.execute(
            "SELECT AVG(latency_ms) FROM messages WHERE sender = 'assistant' AND latency_ms > 0"
        ).fetchone()[0] or 0.0
        
        level_rows = conn.execute(
            "SELECT level, COUNT(*) FROM messages WHERE sender = 'assistant' AND level IS NOT NULL GROUP BY level"
        ).fetchall()
        level_counts = {str(r[0]): r[1] for r in level_rows}
        
        confidence_rows = conn.execute(
            "SELECT confidence, COUNT(*) FROM messages WHERE sender = 'assistant' AND confidence IS NOT NULL GROUP BY confidence"
        ).fetchall()
        confidence_counts = {str(r[0]): r[1] for r in confidence_rows}

        return {
            "total_conversations": total_convs,
            "total_questions": total_msgs // 2,
            "avg_latency_ms": round(avg_latency, 1),
            "level_distribution": level_counts,
            "confidence_distribution": confidence_counts
        }
