from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from newspaper import Article as NewspaperArticle
import trafilatura

from models import ArticleContent


class ScrapeError(Exception):
    pass


def _safe_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _extract_with_trafilatura(url: str) -> Optional[ArticleContent]:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return None

    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
        output_format="txt",
    )
    if not text or len(text.strip()) < 200:
        return None

    meta = None
    extract_metadata_fn = getattr(trafilatura, "extract_metadata", None)
    if callable(extract_metadata_fn):
        meta = extract_metadata_fn(downloaded)

    title = getattr(meta, "title", None) or "Untitled"
    authors_raw = getattr(meta, "author", None)
    authors: List[str] = []
    if isinstance(authors_raw, str) and authors_raw.strip():
        authors = [part.strip() for part in authors_raw.split(",") if part.strip()]

    return ArticleContent(
        url=url,
        title=title,
        text=text.strip(),
        authors=authors,
        publication=getattr(meta, "sitename", None),
        published_at=_safe_datetime(getattr(meta, "date", None)),
    )


def _extract_with_newspaper(url: str) -> Optional[ArticleContent]:
    article = NewspaperArticle(url)
    article.download()
    article.parse()

    if not article.text or len(article.text.strip()) < 200:
        return None

    return ArticleContent(
        url=url,
        title=article.title or "Untitled",
        text=article.text.strip(),
        authors=article.authors or [],
        publication=None,
        published_at=article.publish_date,
    )


def fetch_article(url: str) -> ArticleContent:
    errors: List[str] = []

    try:
        trafilatura_result = _extract_with_trafilatura(url)
        if trafilatura_result:
            return trafilatura_result
    except Exception as exc:  # noqa: BLE001
        errors.append(f"trafilatura failed: {exc}")

    try:
        newspaper_result = _extract_with_newspaper(url)
        if newspaper_result:
            return newspaper_result
    except Exception as exc:  # noqa: BLE001
        errors.append(f"newspaper3k failed: {exc}")

    detail = "; ".join(errors) if errors else "No extractable text found"
    raise ScrapeError(f"Unable to parse URL: {detail}")
