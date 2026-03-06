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


class SummaryResponse(BaseModel):
    article: ArticleContent
    summary: str


class QuoteRequest(BaseModel):
    article: ArticleContent
    debate_topic: str = Field(default="")


class QuoteItem(BaseModel):
    id: str
    quote: str
    context: str
    implication: str
    order: int


class QuotesResponse(BaseModel):
    quotes: List[QuoteItem]


class CardRequest(BaseModel):
    article: ArticleContent
    debate_topic: str = Field(default="")
    selected_quotes: List[str] = Field(default_factory=list)


class CredibilityHeader(BaseModel):
    author_name: str
    credentials: str
    affiliation: str
    defensibility: str
    bias_flags: str
    relay_evidence_note: str = ""


class CardResponse(BaseModel):
    credibility: CredibilityHeader
    tag: str
    cite: str
    primary_warrant_quote_index: int = 0
    bolded_quotes: List[str] = Field(default_factory=list)


class ExportQuoteBlock(BaseModel):
    text: str
    sentence_highlights: List[bool] = Field(default_factory=list)


class ExportRequest(BaseModel):
    tag: str
    cite: str
    source_url: Optional[str] = None
    primary_warrant_quote_index: int = 0
    quote_blocks: List[ExportQuoteBlock] = Field(default_factory=list)
