import React from 'react';

export const MapSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="relative w-screen h-screen bg-canvas overflow-hidden flex items-center justify-center select-none"
    >
      {/* Background vector grid texture */}
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#475569_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Floating loading badge */}
      <div className="relative z-10 flex items-center gap-3 px-5 py-3 rounded-card bg-surface-solid border border-border shadow-e2 text-ink">
        <svg
          className="animate-spin h-5 w-5 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="flex flex-col">
          <span className="font-display text-sm font-bold tracking-tight">
            PocketRoute Map
          </span>
          <span className="text-xs text-ink-muted">
            Initializing vector tiles…
          </span>
        </div>
      </div>
    </div>
  );
};
