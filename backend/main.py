from __future__ import annotations

from io import BytesIO
import re
from typing import Optional

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.shared import Pt, RGBColor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from claude_service import ClaudeResponseError, ClaudeService
from models import CardRequest, CardResponse, ExportRequest, QuoteRequest, QuotesResponse, SummaryResponse, UrlRequest
from scraper import ScrapeError, fetch_article

app = FastAPI(title="CutCards API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_claude: Optional[ClaudeService] = None


def get_claude() -> ClaudeService:
    global _claude
    if _claude is None:
        _claude = ClaudeService()
    return _claude


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/summary", response_model=SummaryResponse)
def summarize(payload: UrlRequest) -> SummaryResponse:
    try:
        article = fetch_article(str(payload.url))
        summary = get_claude().summarize_article(article, payload.debate_topic.strip())
        return SummaryResponse(article=article, summary=summary)
    except ScrapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ClaudeResponseError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}") from exc


@app.post("/api/quotes", response_model=QuotesResponse)
def quotes(payload: QuoteRequest) -> QuotesResponse:
    try:
        items = get_claude().extract_relevant_quotes(payload.article, payload.debate_topic.strip())
        return QuotesResponse(quotes=items)
    except ClaudeResponseError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}") from exc


@app.post("/api/card", response_model=CardResponse)
def build_card(payload: CardRequest) -> CardResponse:
    try:
        return get_claude().build_card(payload.article, payload.debate_topic.strip(), payload.selected_quotes)
    except ClaudeResponseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}") from exc


def _split_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]


def _parse_cite(cite: str, source_url: Optional[str]) -> tuple[str, str]:
    cleaned = " ".join(cite.split())
    parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    lead = parts[0] if parts else "Unknown"
    lead_last_name = lead.split()[-1]
    year_match = re.search(r"(19|20)\d{2}", cleaned)
    year = year_match.group(0) if year_match else ""
    lead_chunk = f"{lead_last_name} {year}".strip()

    details = cleaned
    if source_url and source_url not in details:
        details = f"{details} {source_url}".strip()
    return lead_chunk, details


def _append_sentence(paragraph, sentence: str, emphasized: bool, primary_warrant: bool) -> None:
    parts = sentence.split("**")
    for idx, part in enumerate(parts):
        if not part:
            continue

        run = paragraph.add_run(part)
        run.font.name = "Times New Roman"

        if emphasized:
            run.bold = True
            run.underline = True
            run.font.size = Pt(16 if primary_warrant else 14)
            run.font.color.rgb = RGBColor(0, 0, 0)
            if idx % 2 == 1:
                run.font.highlight_color = WD_COLOR_INDEX.BRIGHT_GREEN
        else:
            run.bold = False
            run.underline = False
            run.font.size = Pt(8)
            run.font.color.rgb = RGBColor(120, 120, 120)

    paragraph.add_run(" ")


@app.post("/api/export")
def export_card(payload: ExportRequest) -> StreamingResponse:
    if not payload.quote_blocks:
        raise HTTPException(status_code=400, detail="At least one quote is required for export")

    doc = Document()
    doc.styles["Normal"].font.name = "Times New Roman"
    doc.styles["Normal"].font.size = Pt(12)

    tag_paragraph = doc.add_paragraph()
    tag_paragraph.paragraph_format.space_before = Pt(0)
    tag_paragraph.paragraph_format.space_after = Pt(0)
    tag_run = tag_paragraph.add_run(payload.tag.strip())
    tag_run.bold = True
    tag_run.underline = True
    tag_run.font.size = Pt(18)
    tag_run.font.color.rgb = RGBColor(0, 0, 0)

    lead, details = _parse_cite(payload.cite, payload.source_url)
    cite_paragraph = doc.add_paragraph()
    cite_paragraph.paragraph_format.space_before = Pt(0)
    cite_paragraph.paragraph_format.space_after = Pt(0)
    lead_run = cite_paragraph.add_run(lead)
    lead_run.bold = True
    lead_run.font.size = Pt(15)
    lead_run.font.color.rgb = RGBColor(0, 0, 0)
    details_run = cite_paragraph.add_run(f" {details}")
    details_run.font.size = Pt(9)
    details_run.font.color.rgb = RGBColor(105, 105, 105)

    primary_index = payload.primary_warrant_quote_index
    if primary_index < 0 or primary_index >= len(payload.quote_blocks):
        primary_index = 0

    for quote_index, block in enumerate(payload.quote_blocks):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        sentences = _split_sentences(block.text.strip())
        sentence_toggles = block.sentence_highlights or [True] * len(sentences)
        is_primary_warrant_quote = quote_index == primary_index
        for idx, sentence in enumerate(sentences):
            is_emphasized = sentence_toggles[idx] if idx < len(sentence_toggles) else True
            _append_sentence(
                p,
                sentence,
                is_emphasized,
                primary_warrant=is_primary_warrant_quote and is_emphasized,
            )

    stream = BytesIO()
    doc.save(stream)
    stream.seek(0)

    headers = {"Content-Disposition": "attachment; filename=cutcard.docx"}
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )
