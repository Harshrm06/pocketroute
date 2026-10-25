import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Surface } from './Surface.js';
import { PillButton } from './PillButton.js';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for observability (PRD §16)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  override render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle ?? 'Component Error';
      const message =
        this.props.fallbackMessage ??
        this.state.error?.message ??
        'An unexpected error occurred in this section.';

      return (
        <Surface
          elevation="e2"
          className={`p-5 flex flex-col items-center justify-center text-center gap-3 border-warning/30 bg-surface-solid/90 ${
            this.props.className ?? ''
          }`}
          role="alert"
          aria-live="assertive"
        >
          <div className="w-10 h-10 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>

          <div className="flex flex-col gap-1 max-w-sm">
            <h4 className="font-display text-sm font-bold text-ink">{title}</h4>
            <p className="text-xs text-ink-muted leading-relaxed line-clamp-3">
              {message}
            </p>
          </div>

          <PillButton
            variant="secondary"
            size="sm"
            onClick={this.handleRetry}
            className="mt-1"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Try again
          </PillButton>
        </Surface>
      );
    }

    return this.props.children;
  }
}
