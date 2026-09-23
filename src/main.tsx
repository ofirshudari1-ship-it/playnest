import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ToastHost from './components/ToastHost';
import './styles/global.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Playnest crashed:', error);
    // A crash before App's own ready signal must still get the window revealed
    // (so this error card is visible) rather than waiting out the 8s splash timeout.
    window.playnest?.notifyReady?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="wizard-shell">
          <div className="wizard-card" style={{ textAlign: 'center' }}>
            <div className="wizard-logo">P</div>
            <h1>Something went wrong</h1>
            <p className="sub">Playnest hit an unexpected error. Try restarting the app.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Restart</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <ToastHost />
  </React.StrictMode>
);
