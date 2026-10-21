# -*- coding: utf-8 -*-
"""
Database layer for Persian VQA system using SQLite.
Stores conversations, messages, images, queries, processing status, and latencies.
"""
import os
import sqlite3
import uuid
import hashlib
import secrets
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
                image_b_filename TEXT,
                image_width INTEGER,
                image_height INTEGER,
                owner_id TEXT,
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
                metadata_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        # Upgrade databases created by older versions without dropping user data.
        conv_cols = {r[1] for r in cursor.execute("PRAGMA table_info(conversations)").fetchall()}
        if "owner_id" not in conv_cols:
            cursor.execute("ALTER TABLE conversations ADD COLUMN owner_id TEXT")
        if "image_b_filename" not in conv_cols:
            cursor.execute("ALTER TABLE conversations ADD COLUMN image_b_filename TEXT")
        msg_cols = {r[1] for r in cursor.execute("PRAGMA table_info(messages)").fetchall()}
        if "metadata_json" not in msg_cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN metadata_json TEXT")
        conn.commit()


def create_user(username: str, display_name: str, password: str) -> dict | None:
    user_id = str(uuid.uuid4())
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO users (id, username, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)",
                (user_id, username, display_name, digest.hex(), salt.hex())
            )
            conn.commit()
        except sqlite3.IntegrityError:
            return None
        # Keep pre-authentication demo history available to its first account.
        conn.execute("UPDATE conversations SET owner_id = ? WHERE owner_id IS NULL", (user_id,))
        conn.commit()
    return get_user_by_id(user_id)


def get_user_by_username(username: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT id, username, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def verify_user_password(user: dict, password: str) -> bool:
    salt = bytes.fromhex(user["password_salt"])
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000).hex()
    return secrets.compare_digest(actual, user["password_hash"])


def create_session(user_id: str, token_hash: str, expires_at: str) -> None:
    with get_db() as conn:
        conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user_id, expires_at))
        conn.commit()


def get_session_user(token_hash: str) -> dict | None:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_hash, now)
        ).fetchone()
        return dict(row) if row else None


def delete_session(token_hash: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()


def rename_conversation(conv_id: str, owner_id: str, title: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cur = conn.execute("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?", (title, now, conv_id, owner_id))
        conn.commit()
        return cur.rowcount > 0


def set_conversation_image_b(conv_id: str, owner_id: str, filename: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cur = conn.execute("UPDATE conversations SET image_b_filename = ?, updated_at = ? WHERE id = ? AND owner_id = ?", (filename, now, conv_id, owner_id))
        conn.commit()
        return cur.rowcount > 0


def owns_image(owner_id: str, filename: str) -> bool:
    with get_db() as conn:
        return conn.execute(
            "SELECT 1 FROM conversations WHERE owner_id = ? AND (image_filename = ? OR image_b_filename = ?) LIMIT 1",
            (owner_id, filename, filename)
        ).fetchone() is not None


def create_conversation(title: str, image_filename: str, width: int = 0, height: int = 0, owner_id: str | None = None, image_b_filename: str | None = None) -> dict:
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO conversations (id, title, image_filename, image_b_filename, image_width, image_height, owner_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (conv_id, title, image_filename, image_b_filename, width, height, owner_id, now, now)
        )
        conn.commit()
    return get_conversation(conv_id)


def get_conversations(limit: int = 50, owner_id: str | None = None) -> list[dict]:
    with get_db() as conn:
        cursor = conn.execute(
            """
            SELECT c.*, 
                   (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
                   (SELECT m.content FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'assistant' ORDER BY m.created_at DESC LIMIT 1) AS last_answer
            FROM conversations c
            WHERE (? IS NULL OR c.owner_id = ?)
            ORDER BY c.updated_at DESC
            LIMIT ?
            """,
            (owner_id, owner_id, limit)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_conversation(conv_id: str, owner_id: str | None = None) -> dict | None:
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM conversations WHERE id = ? AND (? IS NULL OR owner_id = ?)", (conv_id, owner_id, owner_id))
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
    status: str = "completed",
    metadata_json: str | None = None
) -> dict:
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, sender, content, confidence, evidence, level, latency_ms, status, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, conversation_id, sender, content, confidence, evidence, level, latency_ms, status, metadata_json, now)
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id)
        )
        conn.commit()
        
        cursor = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        return dict(cursor.fetchone())


def rate_message(message_id: str, rating: int, owner_id: str | None = None) -> bool:
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE messages SET rating = ? WHERE id = ? AND (? IS NULL OR conversation_id IN (SELECT id FROM conversations WHERE owner_id = ?))",
            (rating, message_id, owner_id, owner_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_system_stats(owner_id: str | None = None) -> dict:
    with get_db() as conn:
        total_convs = conn.execute("SELECT COUNT(*) FROM conversations WHERE (? IS NULL OR owner_id = ?)", (owner_id, owner_id)).fetchone()[0]
        total_msgs = conn.execute("SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE (? IS NULL OR c.owner_id = ?)", (owner_id, owner_id)).fetchone()[0]
        avg_latency = conn.execute(
            "SELECT AVG(m.latency_ms) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.sender = 'assistant' AND m.latency_ms > 0 AND (? IS NULL OR c.owner_id = ?)", (owner_id, owner_id)
        ).fetchone()[0] or 0.0
        
        level_rows = conn.execute(
            "SELECT m.level, COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.sender = 'assistant' AND m.level IS NOT NULL AND (? IS NULL OR c.owner_id = ?) GROUP BY m.level", (owner_id, owner_id)
        ).fetchall()
        level_counts = {str(r[0]): r[1] for r in level_rows}
        
        confidence_rows = conn.execute(
            "SELECT m.confidence, COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.sender = 'assistant' AND m.confidence IS NOT NULL AND (? IS NULL OR c.owner_id = ?) GROUP BY m.confidence", (owner_id, owner_id)
        ).fetchall()
        confidence_counts = {str(r[0]): r[1] for r in confidence_rows}

        return {
            "total_conversations": total_convs,
            "total_questions": total_msgs // 2,
            "avg_latency_ms": round(avg_latency, 1),
            "level_distribution": level_counts,
            "confidence_distribution": confidence_counts
        }
