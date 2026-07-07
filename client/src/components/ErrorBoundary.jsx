import { Component } from 'react';

// One render error should not white-screen the whole app.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="font-display text-xl font-semibold text-snow">
            Something broke in the UI
          </h1>
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 font-mono text-xs leading-relaxed text-red-400">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/');
            }}
            className="btn-primary mt-6"
          >
            Back to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
