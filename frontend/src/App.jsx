import { useMemo, useState } from 'react';
import { fetchQuotes, fetchSummary } from './api';
import UrlSubmit from './components/UrlSubmit';
import ArticleSummary from './components/ArticleSummary';
import QuoteExplorer from './components/QuoteExplorer';
import CardBuilder from './components/CardBuilder';

const STAGES = ['submit', 'summary', 'quotes', 'card'];

function App() {
  const [stage, setStage] = useState('submit');
  const [debateTopic, setDebateTopic] = useState('');
  const [article, setArticle] = useState(null);
  const [summary, setSummary] = useState('');
  const [quotes, setQuotes] = useState([]);

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState('');

  const stageIndex = useMemo(() => STAGES.indexOf(stage), [stage]);

  const handleUrlSubmit = async ({ url, debateTopic: submittedTopic }) => {
    try {
      setLoadingSummary(true);
      setError('');
      setQuotes([]);
      const result = await fetchSummary(url, submittedTopic);
      setDebateTopic(submittedTopic);
      setArticle(result.article);
      setSummary(result.summary);
      setStage('summary');
    } catch (err) {
      setError(err.message || 'Unable to process URL');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleLoadQuotes = async () => {
    if (!article) return;
    try {
      setLoadingQuotes(true);
      setError('');
      const result = await fetchQuotes(article, debateTopic);
      setQuotes(result.quotes || []);
      setStage('quotes');
    } catch (err) {
      setError(err.message || 'Unable to extract quotes');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const restart = () => {
    setStage('submit');
    setError('');
    setDebateTopic('');
    setArticle(null);
    setSummary('');
    setQuotes([]);
  };

  return (
    <main className="app-shell">
      <div className="grid-lines" />
      <div className="content-wrap">
        <nav className="stage-nav" aria-label="Stages">
          {['Submit', 'Summary', 'Quotes', 'Card'].map((label, idx) => (
            <span
              key={label}
              className={idx <= stageIndex ? 'active' : ''}
            >
              {idx + 1}. {label}
            </span>
          ))}
        </nav>

        {stage === 'submit' && (
          <UrlSubmit onSubmit={handleUrlSubmit} loading={loadingSummary} />
        )}

        {stage === 'summary' && article && (
          <ArticleSummary
            article={article}
            summary={summary}
            onBack={restart}
            onContinue={handleLoadQuotes}
            loadingQuotes={loadingQuotes}
          />
        )}

        {stage === 'quotes' && (
          <QuoteExplorer
            quotes={quotes}
            onBack={() => setStage('summary')}
            onContinue={() => setStage('card')}
          />
        )}

        {stage === 'card' && article && (
          <CardBuilder
            article={article}
            quotes={quotes}
            debateTopic={debateTopic}
            onBack={() => setStage('quotes')}
          />
        )}

        {error && <p className="error global-error">{error}</p>}
      </div>
    </main>
  );
}

export default App;
