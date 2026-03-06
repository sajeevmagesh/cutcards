import { useEffect, useMemo, useState } from 'react';
import { buildCard, exportCard } from '../api';

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function parseCiteLine(cite, sourceUrl) {
  const cleaned = (cite || '').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  const lead = parts[0] || 'Unknown';
  const leadWords = lead.split(' ').filter(Boolean);
  const leadLastName = leadWords[leadWords.length - 1] || lead;
  const yearMatch = cleaned.match(/(19|20)\d{2}/);
  const year = yearMatch?.[0] || '';
  const leadChunk = `${leadLastName} ${year}`.trim();
  const details = sourceUrl && !cleaned.includes(sourceUrl) ? `${cleaned} ${sourceUrl}`.trim() : cleaned;
  return { leadChunk, details };
}

function renderMoneyPhrases(text, keyPrefix) {
  return text.split('**').map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      return (
        <mark key={`${keyPrefix}-m-${idx}`} className="money-phrase">
          {part}
        </mark>
      );
    }
    return <span key={`${keyPrefix}-p-${idx}`}>{part}</span>;
  });
}

function CardBuilder({ article, quotes, debateTopic, onBack }) {
  const [selectedIds, setSelectedIds] = useState(() => quotes.map((quote) => quote.id));
  const [cardData, setCardData] = useState(null);
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [sentenceHighlights, setSentenceHighlights] = useState({});

  const selectedItems = useMemo(
    () => quotes.filter((quote) => selectedIds.includes(quote.id)),
    [quotes, selectedIds]
  );

  const selectedQuotes = useMemo(
    () => selectedItems.map((item) => item.quote),
    [selectedItems]
  );

  const displayQuotes = useMemo(() => {
    if (!cardData?.bolded_quotes?.length) {
      return selectedQuotes;
    }
    return selectedQuotes.map((fallback, index) => cardData.bolded_quotes[index] || fallback);
  }, [cardData, selectedQuotes]);

  const citeDisplay = useMemo(
    () => parseCiteLine(cardData?.cite || '', article.url),
    [article.url, cardData?.cite]
  );
  const primaryWarrantQuoteIndex = useMemo(() => {
    if (!displayQuotes.length) return 0;
    const candidate = Number(cardData?.primary_warrant_quote_index ?? 0);
    if (Number.isNaN(candidate) || candidate < 0) return 0;
    return Math.min(candidate, displayQuotes.length - 1);
  }, [cardData?.primary_warrant_quote_index, displayQuotes.length]);

  useEffect(() => {
    if (!selectedQuotes.length) {
      setCardData(null);
      setTagDraft('');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const result = await buildCard(article, debateTopic, selectedQuotes);
        if (!cancelled) {
          setCardData(result);
          setTagDraft(result.tag || '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to build card draft.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [article, debateTopic, selectedQuotes]);

  useEffect(() => {
    setSentenceHighlights((current) => {
      const next = { ...current };
      displayQuotes.forEach((quote, quoteIndex) => {
        if (!Array.isArray(next[quoteIndex])) {
          const sentences = splitSentences(quote);
          next[quoteIndex] = sentences.map(() => true);
        }
      });
      return next;
    });
  }, [displayQuotes]);

  const toggleQuote = (quoteId) => {
    setSelectedIds((current) => {
      if (current.includes(quoteId)) {
        return current.filter((id) => id !== quoteId);
      }
      return [...current, quoteId];
    });
  };

  const toggleSentence = (quoteIndex, sentenceIndex) => {
    setSentenceHighlights((current) => {
      const quoteToggles = [...(current[quoteIndex] || [])];
      quoteToggles[sentenceIndex] = !quoteToggles[sentenceIndex];
      return {
        ...current,
        [quoteIndex]: quoteToggles,
      };
    });
  };

  const buildQuoteBlocksForExport = () => {
    return displayQuotes.map((quote, quoteIndex) => {
      const sentences = splitSentences(quote);
      const toggles = sentenceHighlights[quoteIndex] || sentences.map(() => true);
      return {
        text: quote,
        sentence_highlights: sentences.map((_, idx) => {
          if (idx < toggles.length) return !!toggles[idx];
          return true;
        }),
      };
    });
  };

  const handleExport = async () => {
    if (!cardData || !displayQuotes.length) {
      return;
    }

    setExporting(true);
    setCopyStatus('');

    try {
      const finalTag = tagDraft.trim() || cardData.tag;
      const plainText = [
        finalTag,
        cardData.cite,
        '',
        ...displayQuotes.map((quote) => quote.replaceAll('**', '')),
      ].join('\n\n');

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      }

      const blob = await exportCard(
        finalTag,
        cardData.cite,
        article.url,
        primaryWarrantQuoteIndex,
        buildQuoteBlocksForExport()
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cutcard.docx';
      anchor.click();
      URL.revokeObjectURL(url);

      setCopyStatus('Copied to clipboard and downloaded .docx');
    } catch (err) {
      setCopyStatus(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Card Builder</h2>
        <p className="meta">{article.title}</p>
      </header>

      <div className="card-sections">
        <section className="card-section">
          <h3>1. Credibility Header</h3>
          {loading && <p className="muted">Analyzing source credibility...</p>}
          {cardData?.credibility && (
            <div className="credibility-grid">
              <p><strong>Author:</strong> {cardData.credibility.author_name}</p>
              <p><strong>Credentials:</strong> {cardData.credibility.credentials}</p>
              <p><strong>Affiliation:</strong> {cardData.credibility.affiliation}</p>
              <p><strong>Cross-ex:</strong> {cardData.credibility.defensibility}</p>
              <p><strong>Bias:</strong> {cardData.credibility.bias_flags}</p>
              <p><strong>Relay note:</strong> {cardData.credibility.relay_evidence_note}</p>
            </div>
          )}
        </section>

        <section className="card-section">
          <h3>2. Tag</h3>
          <textarea
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            placeholder="AI-generated tag appears here"
            rows={2}
          />
        </section>

        <section className="card-section">
          <h3>3. Cite</h3>
          <p className="cite-line">{cardData?.cite || 'Generating citation...'}</p>
        </section>

        <section className="card-section">
          <h3>4. Quote Selection</h3>
          <div className="quote-picker">
            {quotes.map((quote) => (
              <label key={quote.id} className="quote-pick-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(quote.id)}
                  onChange={() => toggleQuote(quote.id)}
                />
                <span>{quote.quote}</span>
              </label>
            ))}
          </div>

          <div className="selected-preview">
            {displayQuotes.map((quote, quoteIndex) => {
              const sentences = splitSentences(quote);
              return (
                <article className="selected-quote" key={`selected-${quoteIndex}`}>
                  <div className="sentence-controls">
                    {quoteIndex === primaryWarrantQuoteIndex && (
                      <span className="primary-warrant-pill">Primary warrant</span>
                    )}
                    {sentences.map((_, sentenceIndex) => {
                      const active = sentenceHighlights[quoteIndex]?.[sentenceIndex] ?? true;
                      return (
                        <button
                          type="button"
                          key={`toggle-${quoteIndex}-${sentenceIndex}`}
                          className={active ? 'active' : ''}
                          onClick={() => toggleSentence(quoteIndex, sentenceIndex)}
                        >
                          {active ? `S${sentenceIndex + 1} Key` : `S${sentenceIndex + 1} Crush`}
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="debate-card-preview">
            <p className="card-tag-preview">{tagDraft || 'Generating tag...'}</p>
            <p className="card-cite-preview">
              <span className="cite-lead-preview">{citeDisplay.leadChunk || 'Unknown'}</span>
              <span className="cite-details-preview"> {citeDisplay.details || 'Generating citation...'}</span>
            </p>
            <div className="card-body-preview">
              {displayQuotes.map((quote, quoteIndex) => {
                const sentences = splitSentences(quote);
                return (
                  <p key={`body-${quoteIndex}`}>
                    {sentences.map((sentence, sentenceIndex) => {
                      const active = sentenceHighlights[quoteIndex]?.[sentenceIndex] ?? true;
                      return (
                        <span
                          key={`body-sentence-${quoteIndex}-${sentenceIndex}`}
                          className={
                            active
                              ? `sentence-key ${quoteIndex === primaryWarrantQuoteIndex ? 'sentence-key-primary' : ''}`
                              : 'sentence-crushed'
                          }
                        >
                          {active
                            ? renderMoneyPhrases(sentence, `${quoteIndex}-${sentenceIndex}`)
                            : sentence.replaceAll('**', '')}{' '}
                        </span>
                      );
                    })}
                  </p>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card-section">
          <h3>5. Export</h3>
          <button type="button" onClick={handleExport} disabled={exporting || !displayQuotes.length}>
            {exporting ? 'Exporting...' : 'Export Card'}
          </button>
          {copyStatus && <p className="muted">{copyStatus}</p>}
        </section>
      </div>

      {error && <p className="error">{error}</p>}

      <footer className="panel-footer">
        <button type="button" className="ghost" onClick={onBack}>
          Back
        </button>
      </footer>
    </section>
  );
}

export default CardBuilder;
