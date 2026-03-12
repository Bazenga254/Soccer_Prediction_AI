"""
Publish documentation sections as blog posts under the 'documentation' category.
Run on VPS: cd /root/Soccer_Prediction_AI/backend && python3 publish_docs_to_blog.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import blog
from docs_content import DOCS_SECTIONS

def publish_docs():
    blog.init_blog_db()

    created = 0
    skipped = 0

    for section in DOCS_SECTIONS:
        title = f"{section['title']} - Spark AI Guide"

        # Build a short blog post from the section content
        body_parts = []
        body_parts.append(f"# {section['title']}\n")
        body_parts.append(f"A complete guide to the **{section['title']}** features on Spark AI.\n")

        for item in section["content"]:
            body_parts.append(f"## {item['heading']}\n")
            body_parts.append(f"{item['body']}\n")

        body = "\n".join(body_parts)

        # First paragraph as excerpt
        first_body = section["content"][0]["body"]
        excerpt = first_body[:200] + "..." if len(first_body) > 200 else first_body

        result = blog.create_post(
            title=title,
            excerpt=excerpt,
            body=body,
            category="documentation",
            tags=["documentation", "guide", section["id"]],
            status="published",
            author_name="Spark AI",
            source="docs",
            source_id=f"docs-{section['id']}",
        )

        if result.get("success"):
            print(f"  Created: {title} -> /blog/{result['slug']}")
            created += 1
        elif result.get("error") == "duplicate":
            print(f"  Skipped (exists): {title}")
            skipped += 1
        else:
            print(f"  Error: {title} -> {result.get('error')}")

    print(f"\nDone! Created: {created}, Skipped: {skipped}")


if __name__ == "__main__":
    publish_docs()
