import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled errors during rendering and shows a fallback UI
 * instead of crashing the entire application with a blank screen.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>The application encountered an unexpected error.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
          {this.state.error && (
            <pre>{this.state.error.message}</pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
