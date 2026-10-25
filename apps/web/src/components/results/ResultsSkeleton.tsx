import React from 'react';
import { Surface } from '../ui/index.js';

export const ResultsSkeleton: React.FC = () => {
  return (
    <Surface
      elevation="e2"
      className="p-4 flex flex-col gap-4 animate-pulse select-none"
      role="status"
      aria-label="Loading route alternatives"
    >
      {/* Cards row skeleton */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-card bg-ink/5 dark:bg-ink/10 flex flex-col p-2.5 justify-between border border-border"
          >
            <div className="h-3 w-14 bg-ink/10 dark:bg-ink/20 rounded" />
            <div className="h-5 w-20 bg-ink/15 dark:bg-ink/25 rounded" />
            <div className="h-2.5 w-16 bg-ink/10 dark:bg-ink/20 rounded" />
          </div>
        ))}
      </div>

      {/* Summary line skeleton */}
      <div className="flex items-center justify-between border-y border-border py-2 px-1">
        <div className="h-3.5 w-48 bg-ink/10 dark:bg-ink/20 rounded" />
        <div className="h-3 w-16 bg-ink/10 dark:bg-ink/20 rounded" />
      </div>

      {/* Timeline legs skeleton */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-ink/10 dark:bg-ink/20 shrink-0 mt-0.5" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3.5 w-3/4 bg-ink/10 dark:bg-ink/20 rounded" />
              <div className="h-2.5 w-1/2 bg-ink/5 dark:bg-ink/15 rounded" />
            </div>
            <div className="h-4 w-12 bg-ink/10 dark:bg-ink/20 rounded shrink-0" />
          </div>
        ))}
      </div>
    </Surface>
  );
};
