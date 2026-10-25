import React from 'react';
import { Surface } from '../ui/index.js';

export const InspectorSkeleton: React.FC = () => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Loading Inspector"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-ink/30 backdrop-blur-sm"
      />

      <Surface
        elevation="e3"
        className="relative z-10 w-full sm:w-[560px] h-full bg-surface-solid border-l border-border flex flex-col shadow-e3 overflow-hidden text-ink animate-pulse"
      >
        {/* Header skeleton */}
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-24 rounded-full bg-ink/10 dark:bg-ink/20" />
            <div className="h-6 w-48 rounded bg-ink/15 dark:bg-ink/25" />
          </div>
          <div className="w-8 h-8 rounded-full bg-ink/10 dark:bg-ink/20" />
        </div>

        {/* Tab bar skeleton */}
        <div className="px-5 pt-3 pb-2 border-b border-border flex items-center gap-2 shrink-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-7 w-20 rounded-t-lg bg-ink/10 dark:bg-ink/20"
            />
          ))}
        </div>

        {/* Content body skeleton */}
        <div className="p-6 flex-1 flex flex-col gap-5 overflow-hidden">
          <div className="h-8 w-1/2 rounded bg-ink/10 dark:bg-ink/20" />
          <div className="h-20 w-full rounded-card bg-ink/5 dark:bg-ink/10" />
          <div className="h-48 w-full rounded-card bg-ink/10 dark:bg-ink/15" />
        </div>
      </Surface>
    </div>
  );
};
