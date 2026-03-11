"""
Telegram Channel Scraper for News Feed.
Scrapes public Telegram channels via their web preview (t.me/s/)
and imports posts into the blog/news system as pending items.
"""

import re
import asyncio
import aiohttp
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

import blog

EAT = timezone(timedelta(hours=3))

# Channels to scrape
SCRAPE_CHANNELS = ["FabrizioRomanoTG"]
SCRAPE_INTERVAL = 60  # seconds (1 minute)

# Track last seen post per channel to avoid re-processing
_last_seen: Dict[str, str] = {}


async def scrape_channel(channel: str, limit: int = 10) -> List[Dict]:
    """Scrape recent posts from a public Telegram channel web preview."""
    url = f"https://t.me/s/{channel}"
    posts = []

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    print(f"[Scraper] Failed to fetch {url}: HTTP {resp.status}")
                    return []
                html = await resp.text()
    except Exception as e:
        print(f"[Scraper] Error fetching {channel}: {e}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    messages = soup.find_all("div", class_="tgme_widget_message_wrap")

    for msg_wrap in messages[-limit:]:
        try:
            msg = msg_wrap.find("div", class_="tgme_widget_message")
            if not msg:
                continue

            # Extract post ID
            data_post = msg.get("data-post", "")
            if not data_post:
                continue
            post_id = data_post  # e.g. "FabrizioRomanoTG/12345"

            # Extract text
            text_div = msg.find("div", class_="tgme_widget_message_text")
            text = ""
            if text_div:
                # Get text preserving line breaks
                for br in text_div.find_all("br"):
                    br.replace_with("\n")
                text = text_div.get_text(strip=False).strip()

            # Extract images
            images = []
            photo_wraps = msg.find_all("a", class_="tgme_widget_message_photo_wrap")
            for pw in photo_wraps:
                style = pw.get("style", "")
                img_match = re.search(r"url\(['\"]?(https?://[^'\")\s]+)['\"]?\)", style)
                if img_match:
                    images.append(img_match.group(1))

            # Also check for single image in background
            if not images:
                link_preview = msg.find("a", class_="tgme_widget_message_link_preview")
                if link_preview:
                    img_tag = link_preview.find("i", class_="link_preview_image")
                    if img_tag:
                        style = img_tag.get("style", "")
                        img_match = re.search(r"url\(['\"]?(https?://[^'\")\s]+)['\"]?\)", style)
                        if img_match:
                            images.append(img_match.group(1))

            # Extract date
            date_tag = msg.find("time")
            date_str = date_tag.get("datetime", "") if date_tag else ""

            # Extract forwarded from (if any)
            fwd = msg.find("a", class_="tgme_widget_message_forwarded_from_name")
            forwarded_from = fwd.get_text(strip=True) if fwd else ""

            # Extract link preview info
            link_preview = msg.find("a", class_="tgme_widget_message_link_preview")
            preview_title = ""
            preview_desc = ""
            if link_preview:
                title_div = link_preview.find("div", class_="link_preview_title")
                if title_div:
                    preview_title = title_div.get_text(strip=True)
                desc_div = link_preview.find("div", class_="link_preview_description")
                if desc_div:
                    preview_desc = desc_div.get_text(strip=True)

            if not text and not images:
                continue

            posts.append({
                "post_id": post_id,
                "text": text,
                "date": date_str,
                "images": images,
                "channel": channel,
                "forwarded_from": forwarded_from,
                "preview_title": preview_title,
                "preview_desc": preview_desc,
                "source_url": f"https://t.me/{post_id}",
            })

        except Exception as e:
            print(f"[Scraper] Error parsing message: {e}")
            continue

    return posts


def _import_posts_to_blog(posts: List[Dict], channel: str) -> Dict:
    """Import scraped posts into the blog as pending news items."""
    new_count = 0
    skipped = 0

    for post in posts:
        source_id = post["post_id"]

        # Build title: first line of text or preview title
        text = post["text"]
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        title = lines[0][:120] if lines else post["preview_title"] or "News Update"
        # Clean emoji-heavy titles
        title = title.strip()

        # Body is the full text
        body = text

        # Add link preview context if available
        if post["preview_title"] and post["preview_desc"]:
            body += f"\n\n**{post['preview_title']}**\n{post['preview_desc']}"

        # Add source attribution
        source_label = post["forwarded_from"] or f"@{channel}"
        body += f"\n\n— {source_label}"

        # Determine category from content
        category = _detect_category(text)

        # Download first image as cover (or leave empty — we'll use source URL)
        cover_image = ""
        if post["images"]:
            try:
                cover_image = _download_image(post["images"][0])
            except Exception as e:
                print(f"[Scraper] Could not download image: {e}")

        result = blog.create_post(
            title=title,
            excerpt=text[:200].strip(),
            body=body,
            category=category,
            tags=[],
            cover_image=cover_image,
            status="pending",
            author_name=source_label,
            source="telegram",
            source_id=source_id,
            source_url=post["source_url"],
            post_type="news",
        )

        if result.get("success"):
            new_count += 1
            print(f"[Scraper] Imported: {title[:60]}...")
        else:
            skipped += 1

    return {"new_posts": new_count, "skipped": skipped, "channel": channel}


async def async_channel_to_blog(channel: str) -> Dict:
    """Async version — scrape and import posts (safe to call from running event loop)."""
    posts = await scrape_channel(channel)
    return _import_posts_to_blog(posts, channel)


def sync_channel_to_blog(channel: str) -> Dict:
    """Sync version — for use from non-async contexts (e.g. admin endpoint)."""
    loop = asyncio.new_event_loop()
    try:
        posts = loop.run_until_complete(scrape_channel(channel))
    finally:
        loop.close()
    return _import_posts_to_blog(posts, channel)


def _detect_category(text: str) -> str:
    """Auto-detect news category from content."""
    lower = text.lower()
    if any(w in lower for w in ["transfer", "sign", "deal", "fee", "contract", "loan", "here we go"]):
        return "transfers"
    if any(w in lower for w in ["injur", "knee", "hamstring", "out for", "ruled out", "surgery"]):
        return "injuries"
    if any(w in lower for w in ["score", "goal", "win", "defeat", "draw", "result", "final"]):
        return "results"
    if any(w in lower for w in ["rumor", "rumour", "interested", "considering", "talks", "negotiat"]):
        return "rumors"
    if any(w in lower for w in ["lineup", "starting", "squad", "match", "kick off", "preview"]):
        return "match-updates"
    return "general"


def _download_image(url: str) -> str:
    """Download image from URL and save to blog uploads. Returns local path."""
    import requests
    from pathlib import Path
    import uuid as _uuid

    uploads_dir = Path(__file__).parent / "uploads" / "blog"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    try:
        resp = requests.get(url, timeout=10, stream=True)
        resp.raise_for_status()

        # Determine extension from content type
        ct = resp.headers.get("content-type", "")
        ext = ".jpg"
        if "png" in ct:
            ext = ".png"
        elif "webp" in ct:
            ext = ".webp"
        elif "gif" in ct:
            ext = ".gif"

        filename = f"tg_{_uuid.uuid4().hex[:10]}{ext}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)

        return f"/uploads/blog/{filename}"
    except Exception as e:
        print(f"[Scraper] Image download failed: {e}")
        return ""


async def auto_scrape_loop():
    """Background loop that scrapes channels periodically.
    Uses a lock file so only one worker runs the scraper at a time.
    """
    import os
    import tempfile
    import fcntl

    lock_path = os.path.join(tempfile.gettempdir(), "spark_scraper.lock")

    await asyncio.sleep(30)  # Wait for app startup

    # Try to acquire exclusive lock — only one worker wins
    try:
        lock_fd = open(lock_path, "w")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (IOError, OSError):
        # Another worker already holds the lock — exit silently
        return

    print(f"[Scraper] Auto-scrape started (interval: {SCRAPE_INTERVAL}s, channels: {SCRAPE_CHANNELS})")

    while True:
        for channel in SCRAPE_CHANNELS:
            try:
                result = await async_channel_to_blog(channel)
                if result["new_posts"] > 0:
                    print(f"[Scraper] {channel}: {result['new_posts']} new, {result['skipped']} skipped")
            except Exception as e:
                print(f"[Scraper] Error scraping {channel}: {e}")

        await asyncio.sleep(SCRAPE_INTERVAL)
