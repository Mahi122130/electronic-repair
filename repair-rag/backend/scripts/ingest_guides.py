"""
Fetches real repair guides from iFixit's free public API
and ingests them into pgvector database.
"""

import asyncio
import re
import sys
import uuid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import get_settings
from app.models.orm import RepairGuide
from app.services.rag_service import embed_query

settings = get_settings()

IFIXIT_API = "https://www.ifixit.com/api/2.0"

# Much larger list of device queries
DEVICE_QUERIES = [
    # iPhones
    "iPhone 15 screen replacement",
    "iPhone 14 screen replacement",
    "iPhone 13 screen replacement",
    "iPhone 12 screen replacement",
    "iPhone 11 screen replacement",
    "iPhone XR screen replacement",
    "iPhone battery replacement",
    "iPhone 14 battery replacement",
    "iPhone 13 battery replacement",
    "iPhone 12 battery replacement",
    "iPhone charging port repair",
    "iPhone camera repair",
    "iPhone water damage repair",
    "iPhone speaker repair",
    # Samsung
    "Samsung Galaxy S23 screen repair",
    "Samsung Galaxy S22 screen repair",
    "Samsung Galaxy S21 repair",
    "Samsung Galaxy battery replacement",
    "Samsung Galaxy charging port repair",
    # Laptops
    "MacBook Pro screen replacement",
    "MacBook Air battery replacement",
    "MacBook Pro keyboard replacement",
    "MacBook Pro repair won't turn on",
    "Dell laptop battery replacement",
    "Dell laptop screen replacement",
    "HP laptop keyboard replacement",
    "Lenovo ThinkPad battery replacement",
    "laptop charging port repair",
    "laptop overheating repair",
    "laptop RAM upgrade",
    "laptop SSD replacement",
    # Gaming consoles
    "PlayStation 5 repair",
    "PlayStation 4 repair",
    "PlayStation 4 controller repair",
    "Xbox Series X repair",
    "Xbox One repair",
    "Nintendo Switch screen replacement",
    "Nintendo Switch Joy-Con repair",
    "Nintendo Switch battery replacement",
    # Tablets
    "iPad screen replacement",
    "iPad battery replacement",
    "iPad charging port repair",
    "Samsung tablet screen repair",
    # Other devices
    "AirPods repair",
    "Apple Watch repair",
    "smart TV repair",
    "printer repair",
    "keyboard repair",
    "mouse repair",
]


def clean_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text).strip()


def chunk_text(text: str, chunk_size: int = 250, overlap: int = 40) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(" ".join(words[start:end]))
        start += chunk_size - overlap
    return [c for c in chunks if len(c.strip()) > 50]


def fetch_guides_for_query(query: str, limit: int = 5) -> list[dict]:
    try:
        resp = requests.get(
            f"{IFIXIT_API}/search/{query}",
            params={"doctypes": "guide", "limit": limit},
            timeout=15
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return [
            {
                "guideid": r.get("guideid"),
                "title": r.get("title", ""),
                "url": f"https://www.ifixit.com/Guide/{r.get('guideid')}",
            }
            for r in results if r.get("dataType") == "guide"
        ]
    except Exception as e:
        print(f"  Search error for '{query}': {e}")
        return []


def fetch_guide_content(guideid: int) -> dict | None:
    try:
        resp = requests.get(f"{IFIXIT_API}/guides/{guideid}", timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  Fetch error for guide {guideid}: {e}")
        return None


def extract_text_from_guide(guide_data: dict) -> str:
    parts = []

    if guide_data.get("introduction_rendered"):
        parts.append(clean_html(guide_data["introduction_rendered"]))

    for step in guide_data.get("steps", []):
        if step.get("title"):
            parts.append(f"Step {step.get('orderby', '')}: {step['title']}")
        for line in step.get("lines", []):
            if line.get("text_rendered"):
                text = clean_html(line["text_rendered"]).strip()
                if text:
                    parts.append(text)

    if guide_data.get("conclusion_rendered"):
        parts.append(clean_html(guide_data["conclusion_rendered"]))

    return "\n".join(parts)


async def ingest_all():
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        },
    )
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    total_ingested = 0
    seen_guide_ids = set()

    # Check existing guides to avoid duplicates
    print("🔍 Checking existing guides in database...")
    from sqlalchemy import text
    async with factory() as session:
        result = await session.execute(text("SELECT DISTINCT source_url FROM repair_guides WHERE source_url IS NOT NULL"))
        existing_urls = {row[0] for row in result.fetchall()}
    print(f"   Found {len(existing_urls)} existing guides, skipping them\n")

    for query in DEVICE_QUERIES:
        print(f"🔍 Searching: '{query}'")
        guides = fetch_guides_for_query(query, limit=5)
        print(f"   Found {len(guides)} guides")

        for guide_info in guides:
            guideid = guide_info["guideid"]
            guide_url = guide_info["url"]

            if guideid in seen_guide_ids:
                print(f"   ⏭ Already processed this session, skipping")
                continue

            if guide_url in existing_urls:
                print(f"   ⏭ Already in database, skipping: {guide_info['title']}")
                seen_guide_ids.add(guideid)
                continue

            seen_guide_ids.add(guideid)

            print(f"   📖 Fetching: {guide_info['title']}")
            guide_data = fetch_guide_content(guideid)
            if not guide_data:
                continue

            full_text = extract_text_from_guide(guide_data)
            if len(full_text) < 100:
                print(f"      ⚠ Too short, skipping")
                continue

            subject = guide_data.get("subject", "")
            category = guide_data.get("category", "electronics")
            title = guide_data.get("title", guide_info["title"])

            chunks = chunk_text(full_text)
            print(f"      ✂ {len(chunks)} chunks...", end=" ")

            async with factory() as session:
                for idx, chunk in enumerate(chunks):
                    try:
                        embedding = await embed_query(chunk)
                        record = RepairGuide(
                            id=uuid.uuid4(),
                            title=title,
                            device_type=category.lower(),
                            manufacturer=None,
                            model=subject,
                            chunk_text=chunk,
                            chunk_index=idx,
                            source_url=guide_url,
                            embedding=embedding,
                        )
                        session.add(record)
                        total_ingested += 1
                    except Exception as e:
                        print(f"\n      Error on chunk {idx}: {e}")
                        continue
                await session.commit()

            print(f"✅ Done")

        # Small delay to be respectful to iFixit's API
        await asyncio.sleep(0.5)

    print(f"\n🎉 Total new chunks ingested: {total_ingested}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(ingest_all())