from __future__ import annotations

import os
import re
from typing import List

from anthropic import Anthropic

from models import ArticleContent, CardResponse, CredibilityHeader, QuoteItem

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
    def _extract_many(xml_text: str, parent_tag: str, child_tag: str) -> List[str]:
        parent = ClaudeService._extract_single_tag(xml_text, parent_tag)
        return [
            value.strip()
            for value in re.findall(
                rf"<{child_tag}>(.*?)</{child_tag}>",
                parent,
                flags=re.DOTALL | re.IGNORECASE,
            )
            if value.strip()
        ]

    @staticmethod
    def _enforce_single_bold_segment(text: str) -> str:
        matches = list(re.finditer(r"\*\*.+?\*\*", text))
        if len(matches) <= 1:
            return text

        first_end = matches[0].end()
        suffix = text[first_end:].replace("**", "")
        return f"{text[:first_end]}{suffix}"

    @staticmethod
    def _extract_optional_tag(xml_text: str, tag: str, default: str = "") -> str:
        match = re.search(rf"<{tag}>(.*?)</{tag}>", xml_text, flags=re.DOTALL | re.IGNORECASE)
        if not match:
            return default
        return match.group(1).strip()

    def summarize_article(self, article: ArticleContent, debate_topic: str) -> str:
        system_prompt = (
            "You are a debate research assistant. You write concise, accurate prose briefings "
            "for competitive debaters."
        )

        user_prompt = f"""
Summarize the article for a debater.

Return XML only, with this exact schema:
<summary>
2-3 paragraphs of plain-English flowing prose. No bullet points.
Paragraph 1: what the author argues.
Paragraph 2: what evidence/warrants the author uses.
Paragraph 3 (optional): what conclusion and implications the author reaches.
</summary>

Hard constraints:
- Use only information from the provided article text.
- Do not invent claims or facts.
- Maintain analytical clarity and concrete language.
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

        raw = self._call(system_prompt, user_prompt, max_tokens=1400)
        return self._extract_single_tag(raw, "summary")

    def extract_relevant_quotes(self, article: ArticleContent, debate_topic: str) -> List[QuoteItem]:
        system_prompt = (
            "You are an expert debate evidence cutter. You identify verbatim evidence lines that "
            "matter in rounds and preserve chronological order from source text."
        )

        user_prompt = f"""
Extract the most debate-useful quotes from the article.

Return XML only with this exact structure:
<quotes>
  <quote>
    <order>1</order>
    <text>VERBATIM quote, full sentence(s), unchanged from source.</text>
    <context>Where this fits in the author's argument.</context>
    <implication>What this proves in a debate round, plain English.</implication>
  </quote>
</quotes>

Hard constraints:
- Return 4 to 10 quotes max.
- Quotes must be verbatim from article text.
- Keep quotes in chronological order as they appear in source.
- Include only lines with a claim, warrant, statistic, or concrete impact.
- Exclude setup/filler/background lines unless directly argumentative.
- Do not merge distant sentences; keep each quote contiguous in source.
- Prioritize quotes most useful for the provided debate topic.
- Prefer independent factual claims, statistics, and named-source assertions.
- De-prioritize relay-only accusations unless they are uniquely strategic evidence.

Article metadata:
Title: {article.title}
URL: {article.url}
Debate topic: {debate_topic or "Not provided"}

Article text:
{article.text}
""".strip()

        raw = self._call(system_prompt, user_prompt, max_tokens=2400)
        quote_blocks = re.findall(r"<quote>(.*?)</quote>", raw, flags=re.DOTALL | re.IGNORECASE)
        if not quote_blocks:
            raise ClaudeResponseError("No <quote> blocks returned by Claude")

        quotes: List[QuoteItem] = []
        for idx, block in enumerate(quote_blocks, start=1):
            order = self._extract_single_tag(block, "order") if re.search(r"<order>", block) else str(idx)
            text = self._extract_single_tag(block, "text")
            context = self._extract_single_tag(block, "context")
            implication = self._extract_single_tag(block, "implication")
            quotes.append(
                QuoteItem(
                    id=f"q{idx}",
                    quote=text,
                    context=context,
                    implication=implication,
                    order=int(order) if order.isdigit() else idx,
                )
            )

        quotes.sort(key=lambda q: q.order)
        return quotes

    def build_card(self, article: ArticleContent, debate_topic: str, selected_quotes: List[str]) -> CardResponse:
        if not selected_quotes:
            raise ClaudeResponseError("At least one selected quote is required to build a card")

        quoted_block = "\n\n".join(f"[{i}] {quote}" for i, quote in enumerate(selected_quotes, start=1))

        system_prompt = (
            "You are a national-circuit debate coach producing card-ready outputs. "
            "Be defensible in cross-ex and avoid fabricated credentials."
        )

        user_prompt = f"""
Create card metadata from article + selected quotes.

Return XML only using this exact structure:
<card>
  <credibility>
    <author_name>Primary author name (or Unknown).</author_name>
    <credentials>Professional credentials relevant to topic; if unclear, say "Not clearly stated in source".</credentials>
    <affiliation>Institution/publication affiliation; if unclear, say "Not clearly stated in source".</affiliation>
    <defensibility>One-line cross-ex defensibility assessment.</defensibility>
    <bias_flags>Potential bias/conflict notes, concise.</bias_flags>
    <relay_evidence_note>Explicitly state whether this card relies on reporter-relayed claims vs independent expert/factual reporting.</relay_evidence_note>
  </credibility>
  <tag>One sentence argumentative claim in debate language.</tag>
  <cite>Single line cite string with author last name + year first, then credentials/publication, and URL at end.</cite>
  <primary_warrant_quote_index>1-based index of the single quote containing the strongest standalone warrant across all selected quotes.</primary_warrant_quote_index>
  <bolded_quotes>
    <quote>Each selected quote with exactly one most-standalone warrant phrase wrapped in **double asterisks**.</quote>
  </bolded_quotes>
</card>

Hard constraints:
- Use only data inferable from article metadata/text.
- Never invent credentials; explicitly mark unknown when needed.
- Keep tag concise, assertive, and argumentative.
- Tag must only claim what selected quote text directly proves; do not extrapolate legal conclusions or causal chains.
- If evidence is journalist reporting someone else's statement, frame tag as characterization/reporting, not established fact/precedent.
- Preserve exact quote wording; only add **bold markers** around key phrases.
- Return the same number of <quote> entries as provided selected quotes.
- Make the tag explicitly relevant to the debate topic.
- In each quote, highlight exactly one phrase (single **...** segment) with maximal standalone argumentative weight.
- Choose primary_warrant_quote_index based on structural warrant importance, not chronology.
- If relay evidence is present, relay_evidence_note must explicitly say so (e.g., reporter citing official statement, not independent expert).

Article metadata:
Title: {article.title}
URL: {article.url}
Authors: {", ".join(article.authors) if article.authors else "Unknown"}
Publication: {article.publication or "Unknown"}
Published at: {article.published_at.isoformat() if article.published_at else "Unknown"}
Debate topic: {debate_topic or "Not provided"}

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

        tag = self._extract_single_tag(raw, "tag")
        cite = self._extract_single_tag(raw, "cite")
        primary_warrant_index_text = self._extract_optional_tag(raw, "primary_warrant_quote_index", "1")
        primary_warrant_index = int(primary_warrant_index_text) if primary_warrant_index_text.isdigit() else 1
        bolded_quotes = self._extract_many(raw, "bolded_quotes", "quote")
        bolded_quotes = [self._enforce_single_bold_segment(quote) for quote in bolded_quotes]
        if len(bolded_quotes) != len(selected_quotes):
            # Keep UX stable if model returns fewer rows.
            bolded_quotes = (bolded_quotes + selected_quotes)[: len(selected_quotes)]

        if primary_warrant_index < 1 or primary_warrant_index > len(selected_quotes):
            primary_warrant_index = 1

        return CardResponse(
            credibility=credibility,
            tag=tag,
            cite=cite,
            primary_warrant_quote_index=primary_warrant_index - 1,
            bolded_quotes=bolded_quotes,
        )
