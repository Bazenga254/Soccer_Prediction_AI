"""
SEO Pre-rendering: Injects unique <title>, <meta description>, <h1>, and structured
data into the built index.html before serving to crawlers and browsers.
Fixes: duplicate titles, duplicate descriptions, missing H1, low word count.
"""
import os
import re
from league_seo import LEAGUE_SEO, SLUG_TO_CODE, get_league_seo_localized
from docs_content import DOCS_SECTIONS

BASE_URL = "https://spark-ai-prediction.com"
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

# Cache the template once
_template_cache = {}


def _read_template(lang="en"):
    """Read and cache the index.html template."""
    if lang not in _template_cache:
        suffix = f"-{lang}" if lang != "en" else ""
        path = os.path.join(DIST_DIR, f"index{suffix}.html")
        if not os.path.exists(path):
            path = os.path.join(DIST_DIR, "index.html")
        with open(path, "r", encoding="utf-8") as f:
            _template_cache[lang] = f.read()
    return _template_cache[lang]


def clear_template_cache():
    """Call after frontend rebuild to clear cached templates."""
    _template_cache.clear()


def _inject_seo(html, title, description, h1_text, canonical, extra_head="", extra_body=""):
    """Replace meta tags in index.html with page-specific ones."""
    # Replace <title>
    html = re.sub(
        r"<title>[^<]*</title>",
        f"<title>{title}</title>",
        html,
        count=1,
    )

    # Replace meta description
    html = re.sub(
        r'<meta\s+name="description"\s+content="[^"]*"\s*/?>',
        f'<meta name="description" content="{description}" />',
        html,
        count=1,
    )

    # Replace OG title
    html = re.sub(
        r'<meta\s+property="og:title"\s+content="[^"]*"\s*/?>',
        f'<meta property="og:title" content="{title}" />',
        html,
        count=1,
    )

    # Replace OG description
    html = re.sub(
        r'<meta\s+property="og:description"\s+content="[^"]*"\s*/?>',
        f'<meta property="og:description" content="{description}" />',
        html,
        count=1,
    )

    # Replace OG URL
    html = re.sub(
        r'<meta\s+property="og:url"\s+content="[^"]*"\s*/?>',
        f'<meta property="og:url" content="{canonical}" />',
        html,
        count=1,
    )

    # Replace Twitter title
    html = re.sub(
        r'<meta\s+name="twitter:title"\s+content="[^"]*"\s*/?>',
        f'<meta name="twitter:title" content="{title}" />',
        html,
        count=1,
    )

    # Replace Twitter description
    html = re.sub(
        r'<meta\s+name="twitter:description"\s+content="[^"]*"\s*/?>',
        f'<meta name="twitter:description" content="{description}" />',
        html,
        count=1,
    )

    # Add canonical link if not present
    if '<link rel="canonical"' not in html:
        extra_head += f'\n  <link rel="canonical" href="{canonical}" />'

    # Inject extra head content before </head>
    if extra_head:
        html = html.replace("</head>", f"{extra_head}\n</head>")

    # Inject H1 and extra body content after <div id="root">
    seo_block = f'<h1 style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">{h1_text}</h1>'
    if extra_body:
        seo_block += f"\n{extra_body}"
    html = html.replace(
        '<div id="root"></div>',
        f'<div id="root">{seo_block}</div>',
    )

    return html


# ── Route-specific SEO data ──────────────────────────────────────────

def _get_static_page_seo(path, lang="en"):
    """Return (title, description, h1) for known static routes."""
    pages = {
        "/": (
            "Spark AI — #1 AI Soccer Predictions, Live Scores & Match Analysis",
            "AI-powered soccer predictions with up to 90% accuracy. Live scores, match insights and statistical analysis for Premier League, La Liga, Champions League and 50+ leagues worldwide.",
            "AI Soccer Predictions, Live Scores and Match Analysis",
        ),
        "/today": (
            "Today's Soccer Predictions — AI Match Analysis | Spark AI",
            "Get today's AI-powered soccer predictions across all leagues. Accurate match analysis, score predictions, and betting insights updated daily.",
            "Today's AI Soccer Predictions and Match Analysis",
        ),
        "/blog": (
            "Soccer Betting Blog — Tips, Strategies & AI Insights | Spark AI",
            "Expert soccer betting tips, strategies, and AI-powered insights. Learn how to make smarter betting decisions with data-driven analysis.",
            "Soccer Betting Blog — Tips, Strategies and AI Insights",
        ),
        "/news": (
            "Soccer News — Transfers, Match Updates & Injuries | Spark AI",
            "Latest soccer news covering transfers, match results, injuries, and rumors. Stay updated with real-time football news powered by Spark AI.",
            "Latest Soccer News — Transfers, Match Updates and Injuries",
        ),
        "/docs": (
            "Documentation — How to Use Spark AI Prediction",
            "Complete guide to using Spark AI Prediction. Learn about match analysis, market predictions, credits system, and all platform features.",
            "Spark AI Prediction Documentation",
        ),
        "/terms": (
            "Terms of Service — Spark AI Prediction",
            "Read the terms of service for Spark AI Prediction platform. Privacy policy, usage guidelines, and legal information.",
            "Terms of Service",
        ),
    }
    if path in pages:
        return pages[path]
    return None


def render_page(request_path: str) -> str:
    """
    Given a request path like /predictions/premier-league or /fr/blog,
    return the index.html with injected SEO meta tags.
    """
    path = request_path.rstrip("/") or "/"

    # Detect language prefix
    lang = "en"
    clean_path = path
    lang_match = re.match(r"^/(fr|es|pt|sw|ar)(/.*)?$", path)
    if lang_match:
        lang = lang_match.group(1)
        clean_path = lang_match.group(2) or "/"

    html = _read_template(lang)

    # 1. Static pages
    static_seo = _get_static_page_seo(clean_path, lang)
    if static_seo:
        title, desc, h1 = static_seo
        canonical = f"{BASE_URL}{path}"
        return _inject_seo(html, title, desc, h1, canonical)

    # 2. League prediction pages: /predictions/<slug>
    league_match = re.match(r"^/predictions/([a-z0-9-]+)$", clean_path)
    if league_match:
        slug = league_match.group(1)
        code = SLUG_TO_CODE.get(slug)
        if code:
            seo_data = get_league_seo_localized(code, lang)
            title = f"{seo_data['seo_title']} | Spark AI Prediction"
            desc = seo_data["seo_desc"]
            h1 = seo_data["seo_title"]
            canonical = f"{BASE_URL}{path}"
            return _inject_seo(html, title, desc, h1, canonical)

    # 3. Blog article pages: /blog/<slug>
    blog_match = re.match(r"^/blog/([a-z0-9-]+)$", clean_path)
    if blog_match:
        slug = blog_match.group(1)
        try:
            import blog as blog_mod
            post = blog_mod.get_post_by_slug(slug)
            if post:
                title = f"{post['title']} | Spark AI Blog"
                desc = post.get("excerpt", post["title"])[:160]
                h1 = post["title"]
                canonical = f"{BASE_URL}{path}"
                return _inject_seo(html, title, desc, h1, canonical)
        except Exception:
            pass
        # Try hardcoded blog content
        try:
            import blog_content as bc
            for article in bc.get_all_articles():
                if article["slug"] == slug:
                    title = f"{article['title']} | Spark AI Blog"
                    desc = article.get("excerpt", article["title"])[:160]
                    h1 = article["title"]
                    canonical = f"{BASE_URL}{path}"
                    return _inject_seo(html, title, desc, h1, canonical)
        except Exception:
            pass

    # 4. Docs section pages: /docs/<sectionId>
    docs_match = re.match(r"^/docs/([a-z0-9-]+)$", clean_path)
    if docs_match:
        section_id = docs_match.group(1)
        for section in DOCS_SECTIONS:
            if section["id"] == section_id:
                title = f"{section['title']} — Spark AI Docs"
                desc = f"Learn about {section['title'].lower()} in Spark AI Prediction. Complete documentation and usage guide."
                h1 = section["title"]
                canonical = f"{BASE_URL}{path}"
                return _inject_seo(html, title, desc, h1, canonical)

    # Fallback: return template with default meta (homepage fallback)
    return html
