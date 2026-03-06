from __future__ import annotations

import os
import re
from typing import List
from urllib.parse import urlparse

from anthropic import Anthropic

from models import CardOption, CardResponse, CredibilityHeader, QuoteItem, SummaryBullet, SummaryData

MODEL_NAME = "claude-sonnet-4-20250514"


class ClaudeResponseError(Exception):
    pass


class ClaudeService:
    def __init__(self) -> None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ClaudeResponseError("Missing ANTHROPIC_API_KEY environment variable")
        self.client = Anthropic(api_key=api_key)

    def _call(self, system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> str:
        response = self.client.messages.create(
            model=MODEL_NAME,
            max_tokens=max_tokens,
            temperature=0.2,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        content = []
        for block in response.content:
            if getattr(block, "type", "") == "text":
                content.append(block.text)

        text = "\n".join(content).strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z0-9]*\n", "", text)
            text = re.sub(r"\n```$", "", text)

        return text.strip()

    @staticmethod
    def _extract_single_tag(xml_text: str, tag: str) -> str:
        match = re.search(rf"<{tag}>(.*?)</{tag}>", xml_text, flags=re.DOTALL | re.IGNORECASE)
        if not match:
            raise ClaudeResponseError(f"Missing <{tag}> in Claude response")
        return match.group(1).strip()

    @staticmethod
    def _extract_optional_tag(xml_text: str, tag: str, default: str = "") -> str:
        match = re.search(rf"<{tag}>(.*?)</{tag}>", xml_text, flags=re.DOTALL | re.IGNORECASE)
        if not match:
            return default
        return match.group(1).strip()

    @staticmethod
    def _normalize_text(text: str) -> str:
        translated = (
            text.replace("“", '"')
            .replace("”", '"')
            .replace("’", "'")
            .replace("‘", "'")
            .replace("–", "-")
            .replace("—", "-")
        )
        translated = re.sub(r"\s+", " ", translated)
        return translated.strip()

    @staticmethod
    def _strip_summary_openers(text: str) -> str:
        cleaned = text.strip()
        cleaned = re.sub(
            r"^(the\s+author|the\s+article|the\s+piece|the\s+report)\s+(says|argues|writes|notes|claims|contends|explains)\s+(that\s+)?",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"^[A-Z][a-z]+\s+(says|argues|writes|notes|claims|contends|explains)\s+(that\s+)?", "", cleaned)
        return cleaned[:1].upper() + cleaned[1:] if cleaned else ""

    @staticmethod
    def _segment_article(text: str) -> List[str]:
        raw_parts = [part.strip() for part in re.split(r"\n+", text) if part.strip()]
        segments: List[str] = []

        if len(raw_parts) >= 5:
            buffer = ""
            for part in raw_parts:
                candidate = f"{buffer} {part}".strip() if buffer else part
                if buffer and len(candidate) > 950:
                    segments.append(buffer)
                    buffer = part
                else:
                    buffer = candidate
            if buffer:
                segments.append(buffer)
        else:
            sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
            chunk: List[str] = []
            current_length = 0
            for sentence in sentences:
                chunk.append(sentence)
                current_length += len(sentence)
                if len(chunk) >= 4 or current_length > 750:
                    segments.append(" ".join(chunk))
                    chunk = []
                    current_length = 0
            if chunk:
                segments.append(" ".join(chunk))

        return [segment for segment in segments if len(segment) > 120]

    @staticmethod
    def _format_segmented_article(segments: List[str]) -> str:
        return "\n\n".join(f"[P{index}] {segment}" for index, segment in enumerate(segments, start=1))

    @staticmethod
    def _resolve_quote_segment(quote_text: str, paragraph_index: int, segments: List[str]) -> tuple[int, str] | None:
        normalized_quote = ClaudeService._normalize_text(quote_text)
        if not normalized_quote:
            return None

        preferred_indexes = list(range(len(segments)))
        if 1 <= paragraph_index <= len(segments):
            preferred_indexes = [paragraph_index - 1] + [idx for idx in preferred_indexes if idx != paragraph_index - 1]

        for idx in preferred_indexes:
            segment = segments[idx]
            if normalized_quote in ClaudeService._normalize_text(segment):
                return idx + 1, segment

        return None

    @staticmethod
    def _coverage_label(paragraph_index: int, total_segments: int) -> str:
        if total_segments <= 1:
            return "Full article"
        ratio = paragraph_index / total_segments
        if ratio <= 0.34:
            return "Early article"
        if ratio <= 0.67:
            return "Middle article"
        return "Late article"

    @staticmethod
    def _hostname_label(url: str) -> str:
        hostname = urlparse(url).hostname or url
        return hostname.removeprefix("www.")

    @staticmethod
    def _build_cite(article) -> str:
        if article.authors:
            author_part = article.authors[0]
            if len(article.authors) > 1:
                author_part = f"{article.authors[0]} et al."
        else:
            author_part = article.publication or ClaudeService._hostname_label(article.url)

        year = str(article.published_at.year) if article.published_at else "n.d."
        publication = article.publication or ClaudeService._hostname_label(article.url)
        return f"{author_part} {year}, {publication}, {article.title}, {article.url}"

    def summarize_article(self, article, debate_topic: str) -> SummaryData:
        system_prompt = (
            "You are a debate research assistant. You write accurate, specific bullet briefs for competitive debaters."
        )

        user_prompt = f"""
Summarize the article for a debater.

Return XML only, using this exact structure:
<summary>
  <headline>One sharp sentence describing the article's central takeaway.</headline>
  <bullets>
    <bullet>
      <label>Short heading like Claim, Warrant, Stat, Impact, Mechanism, or Limit.</label>
      <emphasis>claim|warrant|stat|impact|analysis</emphasis>
      <text>Detailed bullet. Start with the substance, not attribution. Avoid phrases like "the author says" or "the article argues".</text>
    </bullet>
  </bullets>
</summary>

Hard constraints:
- Return 5 to 7 bullets.
- Use only information from the provided article text.
- Keep bullets concrete and debater-friendly.
- Pull out numbers, percentages, dates, and quantities as separate `stat` bullets when present.
- Avoid vague attribution framing.
- Keep relevance anchored to the debate topic when provided.

Article metadata:
Title: {article.title}
URL: {article.url}
Authors: {", ".join(article.authors) if article.authors else "Unknown"}
Publication: {article.publication or "Unknown"}
Debate topic: {debate_topic or "Not provided"}

Article text:
{article.text}
""".strip()

        raw = self._call(system_prompt, user_prompt, max_tokens=1800)
        headline = self._extract_single_tag(raw, "headline")
        bullets_block = self._extract_single_tag(raw, "bullets")
        bullet_xml = re.findall(r"<bullet>(.*?)</bullet>", bullets_block, flags=re.DOTALL | re.IGNORECASE)

        bullets: List[SummaryBullet] = []
        for idx, block in enumerate(bullet_xml, start=1):
            label = self._extract_optional_tag(block, "label", "Point")
            emphasis = self._extract_optional_tag(block, "emphasis", "analysis").lower()
            text = self._strip_summary_openers(self._extract_single_tag(block, "text"))
            if not text:
                continue
            bullets.append(
                SummaryBullet(
                    id=f"b{idx}",
                    label=label,
                    text=text,
                    emphasis=emphasis if emphasis in {"claim", "warrant", "stat", "impact", "analysis"} else "analysis",
                )
            )

        if not bullets:
            raise ClaudeResponseError("No summary bullets returned by Claude")

        return SummaryData(headline=headline, bullets=bullets[:7])

    def extract_relevant_quotes(self, article, debate_topic: str, custom_instructions: str = "") -> List[QuoteItem]:
        segments = self._segment_article(article.text)
        if not segments:
            raise ClaudeResponseError("Article text was too short to extract paragraph-level evidence")

        system_prompt = (
            "You are an expert debate evidence cutter. You pull verbatim evidence from across the full article and preserve source fidelity."
        )

        user_prompt = f"""
Extract the most debate-useful quotes from the article.

Return XML only with this exact structure:
<quotes>
  <quote>
    <order>1</order>
    <paragraph_index>1</paragraph_index>
    <text>VERBATIM quote, contiguous, unchanged from the paragraph.</text>
    <why_it_matters>One sentence explaining the debate value of the quote.</why_it_matters>
  </quote>
</quotes>

Hard constraints:
- Return 5 to 8 quotes max.
- Each quote must be verbatim and fully contained inside one numbered paragraph block.
- Pull evidence from across the article, not just the beginning.
- When the article has at least 6 paragraph blocks, use at least 3 distinct paragraph indexes.
- Prefer claim, warrant, impact, and stat-heavy lines.
- Keep quotes in source order.
- Keep `why_it_matters` concise and non-redundant.
- Follow any user customization focus when it does not contradict the article.

Debate topic: {debate_topic or "Not provided"}
Customization focus: {custom_instructions or "None"}

Paragraph blocks:
{self._format_segmented_article(segments)}
""".strip()

        raw = self._call(system_prompt, user_prompt, max_tokens=2800)
        quote_blocks = re.findall(r"<quote>(.*?)</quote>", raw, flags=re.DOTALL | re.IGNORECASE)
        if not quote_blocks:
            raise ClaudeResponseError("No <quote> blocks returned by Claude")

        quotes: List[QuoteItem] = []
        seen_quotes: set[str] = set()
        for idx, block in enumerate(quote_blocks, start=1):
            order_text = self._extract_optional_tag(block, "order", str(idx))
            paragraph_index_text = self._extract_optional_tag(block, "paragraph_index", "1")
            quote_text = self._extract_single_tag(block, "text")
            why_it_matters = self._extract_single_tag(block, "why_it_matters")

            resolved = self._resolve_quote_segment(
                quote_text,
                int(paragraph_index_text) if paragraph_index_text.isdigit() else 1,
                segments,
            )
            if not resolved:
                continue

            resolved_paragraph_index, paragraph = resolved
            normalized_quote = self._normalize_text(quote_text)
            if normalized_quote in seen_quotes:
                continue
            seen_quotes.add(normalized_quote)

            quotes.append(
                QuoteItem(
                    id=f"q{idx}",
                    quote=quote_text.strip(),
                    paragraph=paragraph,
                    why_it_matters=why_it_matters.strip(),
                    order=int(order_text) if order_text.isdigit() else idx,
                    paragraph_index=resolved_paragraph_index,
                    coverage_label=self._coverage_label(resolved_paragraph_index, len(segments)),
                )
            )

        quotes.sort(key=lambda item: (item.paragraph_index, item.order))
        if not quotes:
            raise ClaudeResponseError("Claude did not return verifiable quotes from the article text")
        return quotes[:8]

    def build_card(self, article, debate_topic: str, selected_quotes: List[str], custom_instructions: str = "") -> CardResponse:
        if not selected_quotes:
            raise ClaudeResponseError("At least one selected quote is required to build a card")
        if len(selected_quotes) > 4:
            raise ClaudeResponseError("Select no more than 4 quote blocks per card")

        quoted_block = "\n\n".join(f"[{i}] {quote}" for i, quote in enumerate(selected_quotes, start=1))

        system_prompt = (
            "You are a national-circuit debate coach producing card-ready outputs. Be conservative, defensible, and do not invent credentials."
        )

        user_prompt = f"""
Create card metadata from the selected quotes.

Return XML only using this exact structure:
<card>
  <credibility>
    <author_name>Primary author name (or Unknown).</author_name>
    <credentials>Only credentials clearly stated in metadata/text; otherwise "Not clearly stated in source".</credentials>
    <affiliation>Only affiliation clearly stated in metadata/text; otherwise "Not clearly stated in source".</affiliation>
    <defensibility>One-line cross-ex defensibility assessment.</defensibility>
    <bias_flags>Potential bias/conflict notes, concise.</bias_flags>
    <relay_evidence_note>State whether this is direct reporting/expert evidence or reporter-relayed claims.</relay_evidence_note>
  </credibility>
  <options>
    <option>
      <label>Short label for the card option.</label>
      <format>classic|spotlight|brief</format>
      <tag>One sentence argumentative claim directly supported by the selected quotes.</tag>
      <primary_warrant_quote_index>1</primary_warrant_quote_index>
    </option>
  </options>
</card>

Hard constraints:
- Return exactly 3 options.
- The options must use the same evidence but offer different tag phrasings or framing emphasis.
- Do not overclaim beyond what the selected quotes directly prove.
- Make the tag relevant to the debate topic and user customization when possible.
- Keep every option concise and cross-ex defensible.
- Choose `primary_warrant_quote_index` based on which selected quote does the most structural argumentative work.
- Never invent credentials or affiliation details.

Article metadata:
Title: {article.title}
URL: {article.url}
Authors: {", ".join(article.authors) if article.authors else "Unknown"}
Publication: {article.publication or "Unknown"}
Published at: {article.published_at.isoformat() if article.published_at else "Unknown"}
Debate topic: {debate_topic or "Not provided"}
Customization focus: {custom_instructions or "None"}

Selected quotes:
{quoted_block}
""".strip()

        raw = self._call(system_prompt, user_prompt, max_tokens=2200)

        credibility_block = self._extract_single_tag(raw, "credibility")
        credibility = CredibilityHeader(
            author_name=self._extract_single_tag(credibility_block, "author_name"),
            credentials=self._extract_single_tag(credibility_block, "credentials"),
            affiliation=self._extract_single_tag(credibility_block, "affiliation"),
            defensibility=self._extract_single_tag(credibility_block, "defensibility"),
            bias_flags=self._extract_single_tag(credibility_block, "bias_flags"),
            relay_evidence_note=self._extract_optional_tag(
                credibility_block,
                "relay_evidence_note",
                "No explicit relay-evidence risk detected.",
            ),
        )

        option_block = self._extract_single_tag(raw, "options")
        option_xml = re.findall(r"<option>(.*?)</option>", option_block, flags=re.DOTALL | re.IGNORECASE)
        options: List[CardOption] = []
        for idx, block in enumerate(option_xml, start=1):
            label = self._extract_optional_tag(block, "label", f"Option {idx}")
            format_name = self._extract_optional_tag(block, "format", "classic").lower()
            tag = self._extract_single_tag(block, "tag")
            primary_text = self._extract_optional_tag(block, "primary_warrant_quote_index", "1")
            primary_index = int(primary_text) - 1 if primary_text.isdigit() else 0
            if primary_index < 0 or primary_index >= len(selected_quotes):
                primary_index = 0
            options.append(
                CardOption(
                    id=f"option-{idx}",
                    label=label,
                    format=format_name if format_name in {"classic", "spotlight", "brief"} else "classic",
                    tag=tag,
                    primary_warrant_quote_index=primary_index,
                )
            )

        if len(options) < 3:
            fallback_formats = ["classic", "spotlight", "brief"]
            base_tag = options[0].tag if options else "Selected evidence supports the article's core claim."
            while len(options) < 3:
                option_number = len(options) + 1
                options.append(
                    CardOption(
                        id=f"option-{option_number}",
                        label=f"Option {option_number}",
                        format=fallback_formats[len(options) % len(fallback_formats)],
                        tag=base_tag,
                        primary_warrant_quote_index=0,
                    )
                )

        return CardResponse(
            credibility=credibility,
            cite=self._build_cite(article),
            options=options[:3],
        )
