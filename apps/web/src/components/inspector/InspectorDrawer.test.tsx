// @vitest-environment jsdom
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InspectorDrawer } from './InspectorDrawer.js';
import { OverviewTab } from './OverviewTab.js';
import { DPTableTab } from './DPTableTab.js';
import { DEFAULT_SAMPLE_METRICS } from './types.js';
import type { ProfilerMetrics } from '@pocketroute/shared';

// Mock ResizeObserver for Recharts ResponsiveContainer
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('InspectorDrawer Component', () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const TestWrapper: React.FC<{
    isOpen: boolean;
    metrics?: ProfilerMetrics;
  }> = ({ isOpen, metrics }) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button ref={triggerRef} type="button">
          Open Inspector Trigger
        </button>
        <InspectorDrawer
          isOpen={isOpen}
          onClose={onCloseMock}
          triggerRef={triggerRef}
          metrics={metrics ?? DEFAULT_SAMPLE_METRICS}
        />
      </div>
    );
  };

  it('renders drawer dialog with role="dialog" and aria-labelledby', () => {
    render(<TestWrapper isOpen={true} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Algorithm & Complexity Inspector')).toBeDefined();
  });

  it('switches between all 6 tabs', () => {
    render(<TestWrapper isOpen={true} />);

    // 1. Overview (default)
    expect(
      screen
        .getByRole('tab', { name: /Overview/i })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.getByText(/Multi-Modal RCSPP Algorithm Formulation/i),
    ).toBeDefined();

    // 2. DP Table
    const dpTab = screen.getByRole('tab', { name: /DP Table/i });
    fireEvent.click(dpTab);
    expect(dpTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Dense Cost-Indexed DP Table/i)).toBeDefined();

    // 3. Pruning
    const pruningTab = screen.getByRole('tab', { name: /Pruning/i });
    fireEvent.click(pruningTab);
    expect(pruningTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Branch & Bound Pruning Counters/i)).toBeDefined();

    // 4. Relaxations
    const relaxTab = screen.getByRole('tab', { name: /Relaxations/i });
    fireEvent.click(relaxTab);
    expect(relaxTab.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByText(/Search Operations & Theoretical Ratio/i),
    ).toBeDefined();

    // 5. Chart
    const chartTab = screen.getByRole('tab', { name: /Chart/i });
    fireEvent.click(chartTab);
    expect(chartTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Empirical Algorithm Comparison/i)).toBeDefined();

    // 6. Timing
    const timingTab = screen.getByRole('tab', { name: /Timing/i });
    fireEvent.click(timingTab);
    expect(timingTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Solver Latency & Benchmark/i)).toBeDefined();
  });

  it('closes on Escape key press and returns focus to trigger', () => {
    const { unmount } = render(<TestWrapper isOpen={true} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('implements focus trap wrapping focus from last to first element', () => {
    render(<TestWrapper isOpen={true} />);

    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    // Focus first element, press Shift+Tab -> wraps to last
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

    // Focus last element, press Tab -> wraps to first
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
  });

  it('matches snapshot for Overview tab', () => {
    const { asFragment } = render(
      <OverviewTab metrics={DEFAULT_SAMPLE_METRICS} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders dense DP table when V * (B + 1) <= 20,000', () => {
    const smallMetrics: ProfilerMetrics = {
      ...DEFAULT_SAMPLE_METRICS,
      graph: { V: 142, E: 384, L: 12, B: 75 }, // 142 * 76 = 10,792 <= 20,000
    };

    render(<DPTableTab metrics={smallMetrics} />);

    expect(screen.getByText(/Dense Cost-Indexed DP Table/i)).toBeDefined();
    expect(screen.getByText(/10,792 ≤ 20k \(Dense\)/i)).toBeDefined();
    expect(screen.getByText('Smart Path (Optimal)')).toBeDefined();
  });

  it('falls back to sparse Pareto frontier mode when V * (B + 1) > 20,000', () => {
    const largeMetrics: ProfilerMetrics = {
      ...DEFAULT_SAMPLE_METRICS,
      graph: { V: 300, E: 800, L: 15, B: 100 }, // 300 * 101 = 30,300 > 20,000
    };

    render(<DPTableTab metrics={largeMetrics} />);

    expect(screen.getByText(/Sparse Pareto Frontier per State/i)).toBeDefined();
    expect(
      screen.getByText(/Sparse Pareto Representation Active/i),
    ).toBeDefined();
    expect(screen.getByText(/30,300 > 20k \(Sparse\)/i)).toBeDefined();
  });
});
