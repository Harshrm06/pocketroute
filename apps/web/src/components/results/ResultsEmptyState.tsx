import React from 'react';
import { Surface } from '../ui/index.js';
import { Navigation, Sparkles } from 'lucide-react';

export const ResultsEmptyState: React.FC = () => {
  return (
    <Surface
      elevation="e2"
      className="p-5 flex flex-col items-center text-center gap-3 bg-surface-solid/85"
    >
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Navigation className="w-6 h-6 animate-pulse" />
      </div>

      <div className="flex flex-col gap-1 max-w-xs">
        <h3 className="font-display text-sm font-bold text-ink flex items-center justify-center gap-1.5">
          <span>Explore Pune Transit</span>
          <Sparkles className="w-3.5 h-3.5 text-warning" />
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          Select origin, destination, and budget above. PocketRoute optimizes
          routes using Resource-Constrained Shortest Path across Metro and Bus.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-metro-purple/10 text-metro-purple font-medium">
          Purple Line
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-metro-aqua/10 text-metro-aqua font-medium">
          Aqua Line
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bus/10 text-bus font-medium">
          PMPML BRT
        </span>
      </div>
    </Surface>
  );
};
