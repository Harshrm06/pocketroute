import React from 'react';
import { ModeChip, type ModeVariant } from '../ui/index.js';
import { Play, Pause, RotateCcw, X, Clock, IndianRupee } from 'lucide-react';

export interface CommuteSimulatorHUDProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onClose: () => void;
  progress: number; // 0 to 1
  onSeek?: (progress: number) => void;
  currentTime: string;
  moneySpent: number;
  currentMode: ModeVariant;
  isReducedMotion?: boolean;
}

export const CommuteSimulatorHUD: React.FC<CommuteSimulatorHUDProps> = ({
  isPlaying,
  onTogglePlay,
  onRestart,
  onClose,
  progress,
  onSeek,
  currentTime,
  moneySpent,
  currentMode,
  isReducedMotion = false,
}) => {
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <div
      data-testid="commute-simulator-hud"
      role="region"
      aria-label="Live Commute Simulation HUD"
      className="absolute top-20 left-4 sm:left-[396px] z-[450] bg-surface-solid/95 backdrop-blur-md rounded-card shadow-e3 border border-border p-3 flex flex-col gap-2.5 min-w-[300px] max-w-[380px] animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header: Mode Badge + Clock + Close */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span>SIMULATING</span>
          </div>
          <ModeChip mode={currentMode} iconOnly />
          <span className="text-xs font-semibold text-ink">{currentMode}</span>
        </div>

        <button
          type="button"
          data-testid="sim-close-btn"
          onClick={onClose}
          aria-label="Exit live simulation"
          className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-canvas transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Row: Live Clock + Money Spent So Far */}
      <div className="grid grid-cols-2 gap-2 bg-canvas/60 rounded-card p-2 border border-border/60">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-semibold text-ink-muted flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Live Clock
          </span>
          <span
            data-testid="sim-clock"
            className="font-mono text-sm font-bold text-ink tabular-nums"
          >
            {currentTime}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-semibold text-ink-muted flex items-center gap-1">
            <IndianRupee className="w-3 h-3 text-emerald-600" />
            Money Spent So Far
          </span>
          <span
            data-testid="sim-money-spent"
            className="font-mono text-sm font-bold text-ink tabular-nums"
          >
            ₹{moneySpent}
          </span>
        </div>
      </div>

      {/* Progress Bar & Controls */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted">
          <span>Progress</span>
          <span>{percent}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="sim-progress-bar"
          onClick={(e) => {
            if (!onSeek) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
            onSeek(newProgress);
          }}
          className="w-full h-2 rounded-full bg-border overflow-hidden cursor-pointer relative"
        >
          <div
            className="h-full bg-primary transition-all duration-75 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="sim-play-pause-btn"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            className="flex items-center gap-1 px-3 py-1.5 rounded-btn bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="sim-restart-btn"
            onClick={onRestart}
            aria-label="Restart simulation"
            className="p-1.5 rounded-btn border border-border bg-surface-solid hover:bg-canvas text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {isReducedMotion && (
          <span className="text-[10px] text-ink-muted italic">
            Reduced motion active
          </span>
        )}
      </div>
    </div>
  );
};
