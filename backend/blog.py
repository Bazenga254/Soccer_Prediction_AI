"""
Blog module for Spark AI Prediction.
DB-backed blog with image/video uploads, view tracking, and analytics.
"""

import sqlite3
import os
import uuid
import shutil
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from pathlib import Path

DB_PATH = "community.db"
UPLOADS_DIR = Path(__file__).parent / "uploads" / "blog"

EAT = timezone(timedelta(hours=3))


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_blog_db():
    """Create blog tables."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS blog_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            excerpt TEXT DEFAULT '',
            body TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            tags TEXT DEFAULT '[]',
            cover_image TEXT DEFAULT '',
            video_url TEXT DEFAULT '',
            status TEXT DEFAULT 'draft',
            author_name TEXT DEFAULT 'Spark AI',
            views INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            published_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug);
        CREATE INDEX IF NOT EXISTS idx_blog_status ON blog_posts(status);
        CREATE INDEX IF NOT EXISTS idx_blog_category ON blog_posts(category);

        CREATE TABLE IF NOT EXISTS blog_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            ip_address TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            referrer TEXT DEFAULT '',
            viewed_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_blog_views_post ON blog_views(post_id);
        CREATE INDEX IF NOT EXISTS idx_blog_views_date ON blog_views(viewed_at);
    """)
    conn.commit()

    # Add source columns for Telegram scraper integration
    for col, default in [("source", "'manual'"), ("source_id", "''"), ("source_url", "''"), ("post_type", "'blog'"), ("teams", "'[]'")]:
        try:
            conn.execute(f"ALTER TABLE blog_posts ADD COLUMN {col} TEXT DEFAULT {default}")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

    conn.close()
    print("[OK] Blog DB initialized")


# ==================== CRUD ====================

def _slugify(text: str) -> str:
    """Generate URL-safe slug from title."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug[:100]


def create_post(title: str, excerpt: str = "", body: str = "",
                category: str = "general", tags: list = None,
                cover_image: str = "", video_url: str = "",
                status: str = "draft", author_name: str = "Spark AI",
                source: str = "manual", source_id: str = "",
                source_url: str = "", post_type: str = "blog",
                teams: list = None) -> Dict:
    """Create a new blog post."""
    now = datetime.now(EAT).isoformat()
    slug = _slugify(title)

    # Ensure unique slug
    conn = _get_db()
    existing = conn.execute("SELECT 1 FROM blog_posts WHERE slug = ?", (slug,)).fetchone()
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    # Dedup by source_id (for Telegram scraper)
    if source_id:
        dup = conn.execute("SELECT id FROM blog_posts WHERE source_id = ?", (source_id,)).fetchone()
        if dup:
            conn.close()
            return {"success": False, "error": "duplicate", "id": dup["id"]}

    published_at = now if status == "published" else None

    conn.execute("""
        INSERT INTO blog_posts (slug, title, excerpt, body, category, tags,
            cover_image, video_url, status, author_name, created_at, updated_at,
            published_at, source, source_id, source_url, post_type, teams)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (slug, title.strip(), excerpt.strip(), body, category,
          str(tags or []), cover_image, video_url, status, author_name,
          now, now, published_at, source, source_id, source_url, post_type,
          str(teams or [])))
    conn.commit()
    post_id = conn.execute("SELECT id FROM blog_posts WHERE slug = ?", (slug,)).fetchone()["id"]
    conn.close()

    return {"success": True, "id": post_id, "slug": slug}


def update_post(post_id: int, **fields) -> Dict:
    """Update a blog post."""
    conn = _get_db()
    post = conn.execute("SELECT * FROM blog_posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        conn.close()
        return {"success": False, "error": "Post not found"}

    now = datetime.now(EAT).isoformat()
    updates = []
    params = []

    allowed = ["title", "excerpt", "body", "category", "tags", "cover_image",
               "video_url", "status", "author_name", "slug", "teams"]

    for key, value in fields.items():
        if key in allowed and value is not None:
            if key in ("tags", "teams") and isinstance(value, list):
                value = str(value)
            updates.append(f"{key} = ?")
            params.append(value)

    # Auto-set published_at when publishing for the first time
    if fields.get("status") == "published" and not post["published_at"]:
        updates.append("published_at = ?")
        params.append(now)

    if not updates:
        conn.close()
        return {"success": True}

    updates.append("updated_at = ?")
    params.append(now)
    params.append(post_id)

    conn.execute(f"UPDATE blog_posts SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"success": True}


def delete_post(post_id: int) -> Dict:
    """Delete a blog post and its view records."""
    conn = _get_db()
    # Delete cover image file if exists
    post = conn.execute("SELECT cover_image FROM blog_posts WHERE id = ?", (post_id,)).fetchone()
    if post and post["cover_image"]:
        img_path = UPLOADS_DIR / post["cover_image"].split("/")[-1]
        if img_path.exists():
            img_path.unlink()

    conn.execute("DELETE FROM blog_views WHERE post_id = ?", (post_id,))
    conn.execute("DELETE FROM blog_posts WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def get_post(post_id: int) -> Optional[Dict]:
    """Get a single post by ID (admin)."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM blog_posts WHERE id = ?", (post_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tags"] = _parse_tags(d.get("tags", ""))
    d["teams"] = _parse_tags(d.get("teams", ""))
    return d


def get_post_by_slug(slug: str) -> Optional[Dict]:
    """Get a published post by slug (public)."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'", (slug,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tags"] = _parse_tags(d.get("tags", ""))
    d["teams"] = _parse_tags(d.get("teams", ""))
    return d


def list_posts(status: str = None, category: str = None, limit: int = 50, offset: int = 0, post_type: str = None) -> List[Dict]:
    """List posts with optional filters."""
    conn = _get_db()
    query = "SELECT * FROM blog_posts WHERE 1=1"
    params = []

    if post_type:
        query += " AND COALESCE(post_type, 'blog') = ?"
        params.append(post_type)
    if status:
        query += " AND status = ?"
        params.append(status)
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _parse_tags(tags_str):
    """Convert stored tags string like \"['a', 'b']\" into a real list."""
    if not tags_str:
        return []
    if isinstance(tags_str, list):
        return tags_str
    try:
        import ast
        parsed = ast.literal_eval(tags_str)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    # Fallback: split by comma
    return [t.strip().strip("'\"") for t in tags_str.strip("[]").split(",") if t.strip()]


def list_published(category: str = None, post_type: str = None) -> List[Dict]:
    """List published posts (public API)."""
    conn = _get_db()
    query = "SELECT * FROM blog_posts WHERE status = 'published'"
    params = []
    if post_type:
        query += " AND COALESCE(post_type, 'blog') = ?"
        params.append(post_type)
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY published_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()

    results = []
    for r in rows:
        d = dict(r)
        d.pop("body", None)  # Don't send body in list
        d["tags"] = _parse_tags(d.get("tags", ""))
        d["teams"] = _parse_tags(d.get("teams", ""))
        results.append(d)
    return results


# ==================== IMAGE UPLOAD ====================

def save_cover_image(file_data: bytes, filename: str) -> str:
    """Save a cover image and return its URL path."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"

    unique_name = f"{uuid.uuid4().hex[:12]}.{ext}"
    file_path = UPLOADS_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(file_data)

    return f"/uploads/blog/{unique_name}"


# ==================== VIEW TRACKING ====================

def record_view(post_id: int, ip: str = "", user_agent: str = "", referrer: str = ""):
    """Record a page view for a blog post."""
    now = datetime.now(EAT).isoformat()
    conn = _get_db()
    conn.execute(
        "INSERT INTO blog_views (post_id, ip_address, user_agent, referrer, viewed_at) VALUES (?, ?, ?, ?, ?)",
        (post_id, ip[:45], user_agent[:200], referrer[:300], now)
    )
    conn.execute("UPDATE blog_posts SET views = views + 1 WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()


# ==================== ANALYTICS ====================

def get_analytics() -> Dict:
    """Get blog view analytics: daily, weekly, monthly, yearly + per-post stats."""
    now = datetime.now(EAT)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    conn = _get_db()

    def _count(since):
        r = conn.execute(
            "SELECT COUNT(*) as c FROM blog_views WHERE viewed_at >= ?", (since,)
        ).fetchone()
        return r["c"] if r else 0

    daily = _count(today_start)
    weekly = _count(week_start)
    monthly = _count(month_start)
    yearly = _count(year_start)
    total = conn.execute("SELECT COUNT(*) as c FROM blog_views").fetchone()["c"]

    # Per-post stats (top 20)
    top_posts = conn.execute("""
        SELECT bp.id, bp.title, bp.slug, bp.status, bp.views,
            (SELECT COUNT(*) FROM blog_views bv WHERE bv.post_id = bp.id AND bv.viewed_at >= ?) as daily_views,
            (SELECT COUNT(*) FROM blog_views bv WHERE bv.post_id = bp.id AND bv.viewed_at >= ?) as weekly_views,
            (SELECT COUNT(*) FROM blog_views bv WHERE bv.post_id = bp.id AND bv.viewed_at >= ?) as monthly_views
        FROM blog_posts bp
        ORDER BY bp.views DESC
        LIMIT 20
    """, (today_start, week_start, month_start)).fetchall()

    # Daily views for the last 30 days (for chart)
    daily_chart = conn.execute("""
        SELECT date(viewed_at) as day, COUNT(*) as views
        FROM blog_views
        WHERE viewed_at >= ?
        GROUP BY date(viewed_at)
        ORDER BY day ASC
    """, ((now - timedelta(days=30)).isoformat(),)).fetchall()

    conn.close()

    return {
        "summary": {
            "daily": daily,
            "weekly": weekly,
            "monthly": monthly,
            "yearly": yearly,
            "total": total,
        },
        "top_posts": [dict(r) for r in top_posts],
        "daily_chart": [dict(r) for r in daily_chart],
        "total_posts": len(list_posts()),
        "published_posts": len(list_posts(status="published")),
        "draft_posts": len(list_posts(status="draft")),
    }


# ==================== SEED FROM EXISTING ====================

def seed_from_blog_content():
    """Import existing hardcoded articles from blog_content.py if DB is empty."""
    conn = _get_db()
    count = conn.execute("SELECT COUNT(*) as c FROM blog_posts").fetchone()["c"]
    conn.close()

    if count > 0:
        return  # Already has data

    try:
        import blog_content as bc
        articles = bc.get_all_articles()
        for a in articles:
            create_post(
                title=a["title"],
                excerpt=a.get("excerpt", ""),
                body=a.get("body", ""),
                category=a.get("category", "general"),
                tags=a.get("tags", []),
                status="published",
                author_name="Spark AI",
            )
        print(f"[Blog] Seeded {len(articles)} articles from blog_content.py")
    except Exception as e:
        print(f"[Blog] Could not seed articles: {e}")
