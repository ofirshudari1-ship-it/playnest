import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('React Error Boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p className="error-message">
              Playnest encountered an unexpected error. Try refreshing the app.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="error-details">{this.state.error.toString()}</pre>
            )}
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Refresh Playnest
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
