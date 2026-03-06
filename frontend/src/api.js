const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function handleResponse(response) {
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // Ignore non-JSON errors.
    }
    throw new Error(detail);
  }
  return response;
}

export async function fetchSummary(url, debateTopic) {
  const response = await fetch(`${API_BASE}/api/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, debate_topic: debateTopic }),
  });
  const ok = await handleResponse(response);
  return ok.json();
}

export async function fetchQuotes(article, debateTopic) {
  const response = await fetch(`${API_BASE}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article, debate_topic: debateTopic }),
  });
  const ok = await handleResponse(response);
  return ok.json();
}

export async function buildCard(article, debateTopic, selectedQuotes) {
  const response = await fetch(`${API_BASE}/api/card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      article,
      debate_topic: debateTopic,
      selected_quotes: selectedQuotes,
    }),
  });
  const ok = await handleResponse(response);
  return ok.json();
}

export async function exportCard(tag, cite, sourceUrl, primaryWarrantQuoteIndex, quoteBlocks) {
  const response = await fetch(`${API_BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag,
      cite,
      source_url: sourceUrl,
      primary_warrant_quote_index: primaryWarrantQuoteIndex,
      quote_blocks: quoteBlocks,
    }),
  });
  const ok = await handleResponse(response);
  return ok.blob();
}
