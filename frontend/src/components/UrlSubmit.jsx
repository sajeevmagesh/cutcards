import { useState } from 'react';

function UrlSubmit({ onSubmit, loading }) {
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
    <section className="panel panel-submit">
      <header className="panel-header">
        <h1>CutCards</h1>
        <p>Paste a URL. Pull evidence fast.</p>
      </header>

      <form onSubmit={handleSubmit} className="submit-form">
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
        <label htmlFor="debate-topic">Debate Resolution / Topic Focus</label>
        <textarea
          id="debate-topic"
          placeholder="Resolved: ... or the exact argument you want this evidence to answer"
          value={debateTopic}
          onChange={(event) => setDebateTopic(event.target.value)}
          required
          disabled={loading}
          rows={3}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing...' : 'Hit Enter to Begin'}
        </button>
      </form>
    </section>
  );
}

export default UrlSubmit;
