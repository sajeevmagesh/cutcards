from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class UrlRequest(BaseModel):
    url: HttpUrl
    debate_topic: str = Field(default="")


class ArticleContent(BaseModel):
    url: str
    title: str
    text: str
    authors: List[str] = Field(default_factory=list)
    publication: Optional[str] = None
    published_at: Optional[datetime] = None


class SummaryBullet(BaseModel):
    id: str
    label: str
    text: str
    emphasis: str = "analysis"


class SummaryData(BaseModel):
    headline: str
    bullets: List[SummaryBullet] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    article: ArticleContent
    summary: SummaryData


class QuoteRequest(BaseModel):
    article: ArticleContent
    debate_topic: str = Field(default="")
    custom_instructions: str = Field(default="", max_length=300)


class QuoteItem(BaseModel):
    id: str
    quote: str
    paragraph: str
    why_it_matters: str
    order: int
    paragraph_index: int = 0
    coverage_label: str = ""


class QuotesResponse(BaseModel):
    quotes: List[QuoteItem]


class CardRequest(BaseModel):
    article: ArticleContent
    debate_topic: str = Field(default="")
    custom_instructions: str = Field(default="", max_length=300)
    selected_quotes: List[str] = Field(default_factory=list)


class CredibilityHeader(BaseModel):
    author_name: str
    credentials: str
    affiliation: str
    defensibility: str
    bias_flags: str
    relay_evidence_note: str = ""


class CardOption(BaseModel):
    id: str
    label: str
    format: str
    tag: str
    primary_warrant_quote_index: int = 0


class CardResponse(BaseModel):
    credibility: CredibilityHeader
    cite: str
    options: List[CardOption] = Field(default_factory=list)


class ExportQuoteBlock(BaseModel):
    paragraph_text: str
    quote_text: str


class ExportRequest(BaseModel):
    tag: str
    cite: str
    source_url: Optional[str] = None
    primary_warrant_quote_index: int = 0
    format_variant: str = "classic"
    quote_blocks: List[ExportQuoteBlock] = Field(default_factory=list)
