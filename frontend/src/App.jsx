import { useEffect, useMemo, useState } from 'react';
import { buildCard, exportCard, fetchQuotes, fetchSummary } from './api';
import UrlSubmit from './components/UrlSubmit';
import ArticleSummary from './components/ArticleSummary';
import CardBuilder from './components/CardBuilder';
import LoadingBar from './components/LoadingBar';

const STAGES = ['landing', 'review', 'final'];
const HISTORY_KEY = 'cutcards-history-v2';
const QUOTE_LIMIT = 4;

function readHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 8)));
}

function createHistoryId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `history-${Date.now()}`;
}

function pickDefaultQuoteIds(quotes) {
  return quotes.slice(0, Math.min(3, QUOTE_LIMIT)).map((quote) => quote.id);
}

function App() {
  const [stage, setStage] = useState('landing');
  const [debateTopic, setDebateTopic] = useState('');
  const [article, setArticle] = useState(null);
  const [summary, setSummary] = useState(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [cardData, setCardData] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [citeDraft, setCiteDraft] = useState('');
  const [history, setHistory] = useState(() => readHistory());
  const [activeHistoryId, setActiveHistoryId] = useState('');
  const [loadingState, setLoadingState] = useState({
    active: false,
    label: '',
    detail: '',
    progress: 0,
  });
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');

  const stageIndex = useMemo(() => STAGES.indexOf(stage), [stage]);
  const selectedQuoteItems = useMemo(
    () => quotes.filter((quote) => selectedIds.includes(quote.id)).slice(0, QUOTE_LIMIT),
    [quotes, selectedIds]
  );

  useEffect(() => {
    if (!loadingState.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setLoadingState((current) => {
        if (!current.active) {
          return current;
        }
        return {
          ...current,
          progress: Math.min(current.progress + 6, 92),
        };
      });
    }, 220);

    return () => window.clearInterval(timer);
  }, [loadingState.active]);

  useEffect(() => {
    if (
      !activeHistoryId ||
      stage !== 'final' ||
      !article ||
      !summary ||
      !cardData ||
      !selectedQuoteItems.length
    ) {
      return;
    }

    const entry = {
      id: activeHistoryId,
      savedAt: new Date().toISOString(),
      articleTitle: article.title,
      debateTopic,
      article,
      summary,
      customInstructions,
      quotes,
      selectedIds,
      cardData,
      selectedOptionId,
      citeDraft,
    };

    setHistory((current) => {
      const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 8);
      writeHistory(next);
      return next;
    });
  }, [
    activeHistoryId,
    article,
    cardData,
    citeDraft,
    customInstructions,
    debateTopic,
    quotes,
    selectedIds,
    selectedOptionId,
    selectedQuoteItems.length,
    stage,
    summary,
  ]);

  const startLoading = (label, detail, progress = 14) => {
    setLoadingState({ active: true, label, detail, progress });
  };

  const stopLoading = () => {
    setLoadingState({ active: false, label: '', detail: '', progress: 0 });
  };

  const resetWorkspace = () => {
    setStage('landing');
    setDebateTopic('');
    setArticle(null);
    setSummary(null);
    setCustomInstructions('');
    setQuotes([]);
    setSelectedIds([]);
    setCardData(null);
    setSelectedOptionId('');
    setCiteDraft('');
    setCopyStatus('');
    setError('');
    setLoadingQuotes(false);
    setLoadingCard(false);
    setExporting(false);
    setActiveHistoryId('');
    stopLoading();
  };

  const handleUrlSubmit = async ({ url, debateTopic: submittedTopic }) => {
    try {
      startLoading('Reading article', 'Scraping the source and building a detailed brief.', 18);
      setError('');
      setCopyStatus('');
      setQuotes([]);
      setSelectedIds([]);
      setCardData(null);
      setSelectedOptionId('');
      setCiteDraft('');

      const result = await fetchSummary(url, submittedTopic);
      setArticle(result.article);
      setSummary(result.summary);
      setDebateTopic(submittedTopic);
      setCustomInstructions('');
      setStage('review');
    } catch (err) {
      setError(err.message || 'Unable to process URL');
    } finally {
      stopLoading();
    }
  };

  const handlePullQuotes = async () => {
    if (!article) {
      return;
    }

    try {
      setLoadingQuotes(true);
      startLoading('Pulling evidence', 'Checking for quote blocks across the article.', 24);
      setError('');

      const result = await fetchQuotes(article, debateTopic, customInstructions.trim());
      const nextQuotes = result.quotes || [];
      setQuotes(nextQuotes);
      setSelectedIds((current) => {
        const kept = current.filter((id) => nextQuotes.some((quote) => quote.id === id));
        return kept.length ? kept.slice(0, QUOTE_LIMIT) : pickDefaultQuoteIds(nextQuotes);
      });
    } catch (err) {
      setError(err.message || 'Unable to extract quotes');
    } finally {
      setLoadingQuotes(false);
      stopLoading();
    }
  };

  const handleToggleQuote = (quoteId) => {
    setSelectedIds((current) => {
      if (current.includes(quoteId)) {
        return current.filter((id) => id !== quoteId);
      }
      if (current.length >= QUOTE_LIMIT) {
        return current;
      }
      return [...current, quoteId];
    });
  };

  const handleGenerateCard = async () => {
    if (!article || !selectedQuoteItems.length) {
      return;
    }

    try {
      setLoadingCard(true);
      startLoading('Building card', 'Generating final variants from the selected evidence.', 32);
      setError('');
      setCopyStatus('');

      const result = await buildCard(
        article,
        debateTopic,
        selectedQuoteItems.map((item) => item.quote),
        customInstructions.trim()
      );

      const historyId = activeHistoryId || createHistoryId();
      setActiveHistoryId(historyId);
      setCardData(result);
      setSelectedOptionId(result.options?.[0]?.id || '');
      setCiteDraft(result.cite || '');
      setStage('final');
    } catch (err) {
      setError(err.message || 'Unable to build card');
    } finally {
      setLoadingCard(false);
      stopLoading();
    }
  };

  const handleResumeHistory = (historyId) => {
    const entry = history.find((item) => item.id === historyId);
    if (!entry) {
      return;
    }

    setActiveHistoryId(entry.id);
    setDebateTopic(entry.debateTopic || '');
    setArticle(entry.article || null);
    setSummary(entry.summary || null);
    setCustomInstructions(entry.customInstructions || '');
    setQuotes(entry.quotes || []);
    setSelectedIds(entry.selectedIds || []);
    setCardData(entry.cardData || null);
    setSelectedOptionId(entry.selectedOptionId || entry.cardData?.options?.[0]?.id || '');
    setCiteDraft(entry.citeDraft || entry.cardData?.cite || '');
    setCopyStatus('');
    setError('');
    setStage('final');
  };

  const handleExport = async () => {
    if (!article || !cardData || !selectedQuoteItems.length) {
      return;
    }

    const activeOption =
      cardData.options.find((option) => option.id === selectedOptionId) || cardData.options[0];
    if (!activeOption) {
      return;
    }

    setExporting(true);
    setCopyStatus('');

    try {
      const plainText = [
        activeOption.tag,
        citeDraft,
        '',
        ...selectedQuoteItems.map((item) => `"${item.quote.replace(/^["“]|["”]$/g, '')}"`),
      ].join('\n\n');

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      }

      const blob = await exportCard(
        activeOption.tag,
        citeDraft,
        article.url,
        activeOption.primary_warrant_quote_index,
        activeOption.format,
        selectedQuoteItems.map((item) => ({
          paragraph_text: item.paragraph,
          quote_text: item.quote,
        }))
      );

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cutcard.docx';
      anchor.click();
      URL.revokeObjectURL(url);

      setCopyStatus('Copied to clipboard and downloaded cutcard.docx');
    } catch (err) {
      setCopyStatus(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="ambient-orb ambient-orb-left" />
      <div className="ambient-orb ambient-orb-right" />
      <div className="content-wrap">
        <nav className="stage-nav" aria-label="Stages">
          {['URL', 'Review', 'Final Card'].map((label, idx) => (
            <span key={label} className={idx <= stageIndex ? 'active' : ''}>
              {idx + 1}. {label}
            </span>
          ))}
        </nav>

        {loadingState.active && (
          <LoadingBar
            label={loadingState.label}
            detail={loadingState.detail}
            progress={loadingState.progress}
          />
        )}

        {stage === 'landing' && (
          <UrlSubmit
            onSubmit={handleUrlSubmit}
            loading={loadingState.active}
            history={history}
            onResumeHistory={handleResumeHistory}
          />
        )}

        {stage === 'review' && article && summary && (
          <ArticleSummary
            article={article}
            summary={summary}
            quotes={quotes}
            selectedIds={selectedIds}
            customInstructions={customInstructions}
            onCustomInstructionsChange={setCustomInstructions}
            onPullQuotes={handlePullQuotes}
            onToggleQuote={handleToggleQuote}
            onGenerateCard={handleGenerateCard}
            onBack={resetWorkspace}
            loadingQuotes={loadingQuotes}
            loadingCard={loadingCard}
            quoteLimit={QUOTE_LIMIT}
          />
        )}

        {stage === 'final' && article && cardData && selectedQuoteItems.length > 0 && (
          <CardBuilder
            article={article}
            cardData={cardData}
            selectedQuotes={selectedQuoteItems}
            selectedOptionId={selectedOptionId}
            citeDraft={citeDraft}
            onSelectOption={setSelectedOptionId}
            onCiteChange={setCiteDraft}
            onBack={() => setStage('review')}
            onRestart={resetWorkspace}
            onExport={handleExport}
            exporting={exporting}
            copyStatus={copyStatus}
          />
        )}

        {error && <p className="error global-error">{error}</p>}
      </div>
    </main>
  );
}

export default App;
