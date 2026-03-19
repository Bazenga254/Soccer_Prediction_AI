"""
Google Indexing API integration.
Automatically pings Google when new pages are published or updated.
"""
import os
import json
import logging
import requests
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/indexing"]
INDEXING_API_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"
SITE_URL = "https://spark-ai-prediction.com"

# Path to service account key
KEY_PATH = os.path.join(os.path.dirname(__file__), "google-indexing-key.json")

_credentials = None


def _get_credentials():
    """Load and cache service account credentials."""
    global _credentials
    if _credentials is None:
        if not os.path.exists(KEY_PATH):
            logger.warning("Google Indexing API key not found at %s", KEY_PATH)
            return None
        _credentials = service_account.Credentials.from_service_account_file(
            KEY_PATH, scopes=SCOPES
        )
    # Refresh if expired
    if _credentials.expired or not _credentials.token:
        from google.auth.transport.requests import Request
        _credentials.refresh(Request())
    return _credentials


def notify_google(url: str, action: str = "URL_UPDATED") -> dict:
    """
    Notify Google about a URL change.

    Args:
        url: Full URL to notify about
        action: "URL_UPDATED" or "URL_DELETED"

    Returns:
        API response dict or error dict
    """
    creds = _get_credentials()
    if not creds:
        return {"error": "No credentials available"}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {creds.token}",
    }
    body = {
        "url": url,
        "type": action,
    }

    try:
        resp = requests.post(INDEXING_API_URL, headers=headers, json=body, timeout=10)
        result = resp.json()
        if resp.status_code == 200:
            logger.info("Google Indexing: %s notified successfully", url)
        else:
            logger.warning("Google Indexing error for %s: %s", url, result)
        return result
    except Exception as e:
        logger.error("Google Indexing request failed for %s: %s", url, e)
        return {"error": str(e)}


def notify_blog_published(slug: str):
    """Notify Google that a blog post was published or updated."""
    url = f"{SITE_URL}/blog/{slug}"
    return notify_google(url, "URL_UPDATED")


def notify_page_updated(path: str):
    """Notify Google about any page update (e.g., /today, /live)."""
    url = f"{SITE_URL}{path}"
    return notify_google(url, "URL_UPDATED")


def notify_url_deleted(path: str):
    """Notify Google that a page was removed."""
    url = f"{SITE_URL}{path}"
    return notify_google(url, "URL_DELETED")


def batch_notify(urls: list, action: str = "URL_UPDATED") -> list:
    """Notify Google about multiple URLs."""
    results = []
    for url in urls:
        results.append(notify_google(url, action))
    return results
