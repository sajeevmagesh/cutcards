function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitParagraphForQuote(paragraph, quote) {
  const trimmedQuote = (quote || '').trim().replace(/^["“]|["”]$/g, '');
  if (!trimmedQuote) {
    return { before: paragraph, quote: '', after: '' };
  }

  const pattern = new RegExp(escapeRegex(trimmedQuote).replace(/\s+/g, '\\s+'), 'i');
  const match = paragraph.match(pattern);
  if (!match || match.index == null) {
    return { before: paragraph, quote: trimmedQuote, after: '' };
  }

  return {
    before: paragraph.slice(0, match.index),
    quote: match[0].replace(/^["“]|["”]$/g, ''),
    after: paragraph.slice(match.index + match[0].length),
  };
}

function CardParagraph({ paragraph, quote, primary, format }) {
  const parts = splitParagraphForQuote(paragraph, quote);
  const classes = ['card-paragraph'];
  classes.push(`format-${format}`);
  if (primary) {
    classes.push('card-paragraph-primary');
  }

  return (
    <p className={classes.join(' ')}>
      <span className="context-text">{parts.before}</span>
      {parts.quote && <mark className="quote-focus">“{parts.quote}”</mark>}
      <span className="context-text">{parts.after}</span>
    </p>
  );
}

function CardBuilder({
  article,
  cardData,
  selectedQuotes,
  selectedOptionId,
  citeDraft,
  onSelectOption,
  onCiteChange,
  onBack,
  onRestart,
  onExport,
  exporting,
  copyStatus,
}) {
  const activeOption =
    cardData.options.find((option) => option.id === selectedOptionId) || cardData.options[0];

  return (
    <section className="final-shell">
      <header className="final-header">
        <button type="button" className="ghost" onClick={onBack}>
          Back to review
        </button>
        <div className="final-actions">
          <button type="button" className="ghost" onClick={onRestart}>
            New article
          </button>
          <button type="button" onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Copy + export .docx'}
          </button>
        </div>
      </header>

      <div className="option-switcher" role="tablist" aria-label="Card options">
        {cardData.options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={option.id === activeOption.id ? 'option-pill active' : 'option-pill'}
            onClick={() => onSelectOption(option.id)}
          >
            <strong>{option.label}</strong>
            <span>{option.format}</span>
          </button>
        ))}
      </div>

      <label className="cite-editor">
        <span>Edit citation if needed</span>
        <textarea rows={3} value={citeDraft} onChange={(event) => onCiteChange(event.target.value)} />
      </label>

      <article className={`final-card format-${activeOption.format}`}>
        <div className="card-topline">
          <span>{article.publication || new URL(article.url).hostname}</span>
          <small>{cardData.credibility.defensibility}</small>
        </div>

        <h2 className="final-tag">{activeOption.tag}</h2>

        <p className="final-cite">
          <strong>{citeDraft}</strong>
        </p>

        <div className="final-card-body">
          {selectedQuotes.map((item, index) => (
            <CardParagraph
              key={item.id}
              paragraph={item.paragraph}
              quote={item.quote}
              format={activeOption.format}
              primary={index === activeOption.primary_warrant_quote_index}
            />
          ))}
        </div>

        <footer className="final-card-footer">
          <div>
            <span>Author</span>
            <p>{cardData.credibility.author_name}</p>
          </div>
          <div>
            <span>Credentials</span>
            <p>{cardData.credibility.credentials}</p>
          </div>
          <div>
            <span>Relay note</span>
            <p>{cardData.credibility.relay_evidence_note}</p>
          </div>
        </footer>
      </article>

      {copyStatus && <p className="muted centered">{copyStatus}</p>}
    </section>
  );
}

export default CardBuilder;
