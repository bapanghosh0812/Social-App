import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches rendering errors so one broken screen never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error', error, errorInfo);
  }

  public render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-6">
        <div className="card w-full max-w-sm space-y-5 p-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-grad font-display text-xl font-bold text-onbrand">CC</div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Something went wrong</h2>
            <p className="mt-1 text-sm text-ink2">This screen hit an unexpected problem. Your data is safe — reload to continue.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-grad text-sm font-semibold text-onbrand"
            >
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-4 text-sm font-semibold text-ink2"
            >
              <Home className="h-4 w-4" /> Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
