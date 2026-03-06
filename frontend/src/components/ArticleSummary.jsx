function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderParagraphWithQuote(paragraph, quote, keyPrefix) {
  const trimmedQuote = (quote || '').trim().replace(/^["“]|["”]$/g, '');
  if (!trimmedQuote) {
    return paragraph;
  }

  const pattern = new RegExp(escapeRegex(trimmedQuote).replace(/\s+/g, '\\s+'), 'i');
  const match = paragraph.match(pattern);
  if (!match || match.index == null) {
    return (
      <>
        <span>{paragraph} </span>
        <mark>“{trimmedQuote}”</mark>
      </>
    );
  }

  const before = paragraph.slice(0, match.index);
  const after = paragraph.slice(match.index + match[0].length);
  return (
    <>
      <span>{before}</span>
      <mark key={`${keyPrefix}-quote`}>“{match[0].replace(/^["“]|["”]$/g, '')}”</mark>
      <span>{after}</span>
    </>
  );
}

function ArticleSummary({
  article,
  summary,
  quotes,
  selectedIds,
  customInstructions,
  onCustomInstructionsChange,
  onPullQuotes,
  onToggleQuote,
  onGenerateCard,
  onBack,
  loadingQuotes,
  loadingCard,
  quoteLimit,
}) {
  const selectedCount = selectedIds.length;

  return (
    <section className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Review Workspace</p>
          <h2>{article.title}</h2>
          <p className="meta">
            {article.publication || new URL(article.url).hostname}
            {article.published_at ? ` • ${new Date(article.published_at).toLocaleDateString()}` : ''}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>
          New article
        </button>
      </header>

      <div className="workspace-grid">
        <section className="review-panel summary-panel">
          <div className="panel-intro">
            <h3>Detailed brief</h3>
            <p>Numbers and concrete warrants get surfaced first.</p>
          </div>

          <div className="headline-band">
            <span>Core takeaway</span>
            <p>{summary.headline}</p>
          </div>

          <div className="summary-bullets">
            {summary.bullets.map((bullet) => (
              <article key={bullet.id} className={`summary-bullet summary-${bullet.emphasis}`}>
                <div className="summary-label-row">
                  <span>{bullet.label}</span>
                  {bullet.emphasis === 'stat' && <strong>Numbers</strong>}
                </div>
                <p>{bullet.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="review-panel control-panel">
          <div className="panel-intro">
            <h3>Customize the card</h3>
            <p>Describe what you want the final card to emphasize. Limit 300 characters.</p>
          </div>

          <label htmlFor="custom-instructions">Card instructions</label>
          <textarea
            id="custom-instructions"
            rows={4}
            maxLength={300}
            value={customInstructions}
            onChange={(event) => onCustomInstructionsChange(event.target.value)}
            placeholder="Example: make this a neg card on solvency deficits and lean hard into the cost statistics."
          />
          <div className="control-meta">
            <span>{customInstructions.length}/300</span>
            <button type="button" onClick={onPullQuotes} disabled={loadingQuotes || loadingCard}>
              {loadingQuotes ? 'Pulling evidence...' : quotes.length ? 'Refresh evidence' : 'Pull evidence'}
            </button>
          </div>

          <div className="instruction-list compact">
            <p>Select up to {quoteLimit} quote blocks for the final card.</p>
            <p>Each block keeps the surrounding paragraph instead of shrinking the rest to filler text.</p>
            <p>Context and implication are merged into one usable explanation line.</p>
          </div>
        </section>
      </div>

      <section className="review-panel quote-panel">
        <div className="quote-panel-head">
          <div className="panel-intro">
            <h3>Evidence pull</h3>
            <p>Quotes are spread across the article when possible and checked against the scraped text.</p>
          </div>
          <div className="selection-chip">
            {selectedCount}/{quoteLimit} selected
          </div>
        </div>

        {quotes.length === 0 && (
          <div className="empty-state large">
            Pull evidence after reviewing the brief. The final page will only show the finished card.
          </div>
        )}

        {quotes.length > 0 && (
          <div className="quote-list review-quotes">
            {quotes.map((item) => {
              const selected = selectedIds.includes(item.id);
              const limitReached = !selected && selectedCount >= quoteLimit;
              return (
                <article className={`quote-item ${selected ? 'quote-item-selected' : ''}`} key={item.id}>
                  <div className="quote-card-top">
                    <div>
                      <span className="quote-order">P{item.paragraph_index}</span>
                      <p className="quote-coverage">{item.coverage_label}</p>
                    </div>
                    <label className={`toggle-tile ${limitReached ? 'toggle-disabled' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleQuote(item.id)}
                        disabled={limitReached}
                      />
                      <span>{selected ? 'Included' : 'Include'}</span>
                    </label>
                  </div>

                  <blockquote className="paragraph-block">
                    {renderParagraphWithQuote(item.paragraph, item.quote, item.id)}
                  </blockquote>

                  <div className="quote-explainer">
                    <span>Why it matters</span>
                    <p>{item.why_it_matters}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <footer className="panel-footer review-footer">
          <button
            type="button"
            onClick={onGenerateCard}
            disabled={loadingCard || selectedCount === 0}
          >
            {loadingCard ? 'Building card options...' : 'Open final card'}
          </button>
        </footer>
      </section>
    </section>
  );
}

export default ArticleSummary;
