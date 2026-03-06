function LoadingBar({ label, detail, progress }) {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <div className="loading-copy">
        <p>{label}</p>
        <span>{detail}</span>
      </div>
      <div className="loading-track" aria-hidden="true">
        <div className="loading-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default LoadingBar;
