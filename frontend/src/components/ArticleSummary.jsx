function ArticleSummary({ article, summary, onBack, onContinue, loadingQuotes }) {
  const paragraphs = summary
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{article.title}</h2>
        <p className="meta">{article.publication || new URL(article.url).hostname}</p>
      </header>

      <article className="summary-copy">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 30)}>{paragraph}</p>
        ))}
      </article>

      <footer className="panel-footer">
        <button type="button" className="ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" onClick={onContinue} disabled={loadingQuotes}>
          {loadingQuotes ? 'Pulling quotes...' : 'This looks relevant → Continue'}
        </button>
      </footer>
    </section>
  );
}

export default ArticleSummary;
