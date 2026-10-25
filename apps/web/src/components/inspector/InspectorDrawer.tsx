import React, { useEffect, useRef, useState } from 'react';
import type { ProfilerMetrics } from '@pocketroute/shared';
import { Surface, IconButton } from '../ui/index.js';
import { OverviewTab } from './OverviewTab.js';
import { DPTableTab } from './DPTableTab.js';
import { PruningTab } from './PruningTab.js';
import { RelaxationsTab } from './RelaxationsTab.js';
import { ChartTab } from './ChartTab.js';
import { TimingTab } from './TimingTab.js';
import {
  DEFAULT_SAMPLE_METRICS,
  type InspectorTabKey,
  type InspectorDrawerProps,
} from './types.js';
import {
  BarChart2,
  BookOpen,
  Clock,
  Filter,
  Grid,
  Scissors,
  X,
} from 'lucide-react';

export { type InspectorDrawerProps };

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  isOpen,
  onClose,
  triggerRef,
  metrics: inputMetrics,
  budgetINR = 75,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTabKey>('overview');
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Fallback to sample metrics if none provided or partial
  const isCompleteMetrics = Boolean(
    inputMetrics &&
      typeof inputMetrics === 'object' &&
      'timing' in inputMetrics &&
      'theory' in inputMetrics &&
      'graph' in inputMetrics,
  );

  const metrics: ProfilerMetrics = isCompleteMetrics
    ? (inputMetrics as ProfilerMetrics)
    : {
        ...DEFAULT_SAMPLE_METRICS,
        graph: {
          ...DEFAULT_SAMPLE_METRICS.graph,
          B: budgetINR,
        },
      };

  // Focus trap & Escape listener (PRD §15.4)
  useEffect(() => {
    if (!isOpen) return;

    // Remember currently focused trigger element
    previousActiveElementRef.current =
      triggerRef?.current ?? (document.activeElement as HTMLElement | null);

    // Focus close button on mount
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements =
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );

        if (focusableElements.length === 0) return;

        const first = focusableElements[0]!;
        const last = focusableElements[focusableElements.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      // Return focus to trigger element when drawer closes
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const tabs: Array<{
    key: InspectorTabKey;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'overview',
      label: 'Overview',
      icon: <BookOpen className="w-3.5 h-3.5" />,
    },
    {
      key: 'dp-table',
      label: 'DP Table',
      icon: <Grid className="w-3.5 h-3.5" />,
    },
    {
      key: 'pruning',
      label: 'Pruning',
      icon: <Scissors className="w-3.5 h-3.5" />,
    },
    {
      key: 'relaxations',
      label: 'Relaxations',
      icon: <Filter className="w-3.5 h-3.5" />,
    },
    {
      key: 'chart',
      label: 'Chart',
      icon: <BarChart2 className="w-3.5 h-3.5" />,
    },
    { key: 'timing', label: 'Timing', icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-ink/30 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Drawer Surface: 560px on desktop (PRD §15.4), full width on mobile */}
      <Surface
        ref={drawerRef}
        elevation="e3"
        className="relative z-10 w-full sm:w-[480px] lg:w-[560px] h-full bg-surface-solid border-l border-border flex flex-col shadow-e3 overflow-hidden text-ink"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0 bg-surface-solid/80">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-contrast font-bold">
              DAA INSPECTOR
            </span>
            <h2
              id="inspector-title"
              className="font-display text-lg font-bold tracking-tight text-ink"
            >
              Algorithm & Complexity Inspector
            </h2>
          </div>

          <IconButton
            ref={closeBtnRef}
            aria-label="Close inspector drawer"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Tab Navigation (PRD §15.4) */}
        <div
          role="tablist"
          aria-label="Inspector Views"
          className="px-5 pt-2 border-b border-border flex items-center gap-1 overflow-x-auto shrink-0 bg-canvas/40 scrollbar-none"
        >
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={isSelected}
                aria-controls={`panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`py-2 px-3 text-xs font-semibold rounded-t-lg transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap border-b-2 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  isSelected
                    ? 'border-primary text-ink bg-surface-solid shadow-sm'
                    : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-solid/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50"
        >
          {activeTab === 'overview' && <OverviewTab metrics={metrics} />}
          {activeTab === 'dp-table' && <DPTableTab metrics={metrics} />}
          {activeTab === 'pruning' && <PruningTab metrics={metrics} />}
          {activeTab === 'relaxations' && <RelaxationsTab metrics={metrics} />}
          {activeTab === 'chart' && <ChartTab metrics={metrics} />}
          {activeTab === 'timing' && <TimingTab metrics={metrics} />}
        </div>
      </Surface>
    </div>
  );
};
