function QuoteExplorer({ quotes, onBack, onContinue }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Relevant Quotes</h2>
        <p className="meta">Chronological order from source</p>
      </header>

      <div className="quote-list">
        {quotes.map((item, index) => (
          <article className="quote-item" key={item.id}>
            <div className="quote-order">#{index + 1}</div>
            <blockquote>{item.quote}</blockquote>

            <details>
              <summary>Context</summary>
              <p>{item.context}</p>
            </details>

            <details>
              <summary>Implication</summary>
              <p>{item.implication}</p>
            </details>
          </article>
        ))}
      </div>

      <footer className="panel-footer">
        <button type="button" className="ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" onClick={onContinue}>
          Happy with what you see? → Cut your card
        </button>
      </footer>
    </section>
  );
}

export default QuoteExplorer;
