import { useState } from 'react';

function UrlSubmit({ onSubmit, loading, history, onResumeHistory }) {
  const [url, setUrl] = useState('');
  const [debateTopic, setDebateTopic] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!url.trim() || !debateTopic.trim()) {
      return;
    }

    onSubmit({
      url: url.trim(),
      debateTopic: debateTopic.trim(),
    });
  };

  return (
    <section className="landing-shell">
      <div className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Debate Evidence Workflow</p>
          <h1>Cut cleaner cards from a single article pass.</h1>
          <p className="hero-text">
            Start with the URL once. Review a stat-heavy brief, shape the card with your own
            instructions, then export a final cut with full-paragraph context.
          </p>

          <div className="hero-notes">
            <div>
              <span>1</span>
              <p>Paste the article URL and your debate focus.</p>
            </div>
            <div>
              <span>2</span>
              <p>Review the article brief, pull quotes from across the piece, and keep up to 4 blocks.</p>
            </div>
            <div>
              <span>3</span>
              <p>Choose a final card variant, edit the cite if needed, and export.</p>
            </div>
          </div>
        </div>

        <div className="landing-side">
          <form onSubmit={handleSubmit} className="submit-form landing-form">
            <div className="panel-intro">
              <h2>Start a new cut</h2>
              <p>URL only lives here. Later steps stay focused on the evidence.</p>
            </div>

            <label htmlFor="article-url">Article URL</label>
            <input
              id="article-url"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              disabled={loading}
              autoFocus
            />

            <label htmlFor="debate-topic">Debate Resolution / Answer This Argument</label>
            <textarea
              id="debate-topic"
              placeholder="Resolved: ... or the specific argument this card needs to answer"
              value={debateTopic}
              onChange={(event) => setDebateTopic(event.target.value)}
              required
              disabled={loading}
              rows={4}
            />

            <button type="submit" disabled={loading}>
              {loading ? 'Reading article...' : 'Open the article'}
            </button>
          </form>

          <aside className="history-card">
            <div className="panel-intro">
              <h2>Instructions</h2>
              <p>Use a clean article URL. The next step lets you add custom card instructions.</p>
            </div>

            <div className="instruction-list">
              <p>Stats and numbers get prioritized in the brief when the source gives them.</p>
              <p>Quotes are verified against the scraped article before they show up.</p>
              <p>Card history is stored locally in this browser.</p>
            </div>

            <div className="panel-intro history-intro">
              <h2>History</h2>
              <p>Resume a recent card without re-pasting the URL.</p>
            </div>

            <div className="history-list">
              {history.length === 0 && <p className="empty-state">No saved cards yet.</p>}
              {history.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="history-item"
                  onClick={() => onResumeHistory(entry.id)}
                >
                  <strong>{entry.articleTitle}</strong>
                  <span>{entry.debateTopic}</span>
                  <small>{new Date(entry.savedAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default UrlSubmit;
