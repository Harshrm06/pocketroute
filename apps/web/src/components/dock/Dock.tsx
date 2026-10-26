import React, { useState } from 'react';
import { usePlanStore } from '../../store/plan.js';
import { Autocomplete } from './Autocomplete.js';
import { IconButton, PillButton, Slider, Surface } from '../ui/index.js';
import { ArrowUpDown, Clock, Sparkles } from 'lucide-react';

export interface DockProps {
  className?: string;
  onSuccess?: () => void;
}

export const Dock: React.FC<DockProps> = ({ className = '', onSuccess }) => {
  const {
    origin,
    destination,
    departureTime,
    budgetINR,
    status,
    error,
    validationErrors,
    locationMessage,
    setLocationMessage,
    simulateDemoLocation,
    setOrigin,
    setDestination,
    swapEndpoints,
    setDepartureTime,
    setBudgetINR,
    planRoute,
  } = usePlanStore();

  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [customTime, setCustomTime] = useState<boolean>(
    departureTime !== 'now',
  );

  const handleSwap = () => {
    setIsSwapping((prev) => !prev);
    swapEndpoints();
  };

  const handleDepartureModeToggle = (mode: 'now' | 'custom') => {
    if (mode === 'now') {
      setCustomTime(false);
      setDepartureTime('now');
    } else {
      setCustomTime(true);
      // Default to current time formatted HH:mm
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setDepartureTime(`${hh}:${mm}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await planRoute();
    if (result && onSuccess) {
      onSuccess();
    }
  };

  const isLoading = status === 'loading';

  return (
    <Surface
      as="form"
      onSubmit={handleSubmit}
      elevation="e3"
      className={`p-5 flex flex-col gap-4 text-ink ${className}`}
      aria-label="Trip Search and Budget Dock"
    >
      {/* 1. Origin & Destination Autocomplete with animated 180° Swap Button (PRD §15.1) */}
      <div className="flex flex-col gap-2 relative">
        <Autocomplete
          id="origin-input"
          label="Starting Point"
          placeholder="Enter station, bus stop, or place…"
          value={origin}
          onChange={setOrigin}
          error={validationErrors.origin}
          isStart={true}
        />

        {locationMessage && (
          <div
            role="alert"
            data-testid="location-message-banner"
            className="rounded-lg p-2.5 text-xs bg-amber-500/10 border border-amber-500/30 text-ink flex flex-col gap-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="leading-snug">{locationMessage.text}</span>
              <button
                type="button"
                onClick={() => setLocationMessage(null)}
                className="text-ink-muted hover:text-ink text-xs font-bold px-1"
                aria-label="Dismiss notice"
              >
                ✕
              </button>
            </div>
            {locationMessage.showDemoFallback && (
              <button
                type="button"
                data-testid="simulate-gps-button"
                onClick={() => {
                  simulateDemoLocation();
                }}
                className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary-hover active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <span>Simulate GPS in Pune (VIT Bibwewadi / Swargate)</span>
              </button>
            )}
          </div>
        )}

        <div className="relative flex items-center justify-center my-0.5 z-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <IconButton
            type="button"
            aria-label="Swap origin and destination"
            variant="surface"
            size="sm"
            onClick={handleSwap}
            className={`transition-transform duration-300 ease-in-out ${
              isSwapping ? 'rotate-180' : 'rotate-0'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-ink-muted" />
          </IconButton>
        </div>

        <Autocomplete
          id="destination-input"
          label="Destination"
          placeholder="Enter station, landmark, or stop…"
          value={destination}
          onChange={setDestination}
          error={validationErrors.destination}
        />
      </div>

      {/* 2. Departure Time Picker (defaults to 'Now', PRD §15.1) */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="departure-time-select"
          className="text-xs font-semibold text-ink-muted select-none flex items-center gap-1.5"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Departure Time</span>
        </label>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-card bg-canvas border border-border flex-1">
            <button
              type="button"
              onClick={() => handleDepartureModeToggle('now')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-input transition-all duration-150 select-none ${
                !customTime
                  ? 'bg-surface-solid text-ink shadow-e1 font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Now (IST)
            </button>
            <button
              type="button"
              onClick={() => handleDepartureModeToggle('custom')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-input transition-all duration-150 select-none ${
                customTime
                  ? 'bg-surface-solid text-ink shadow-e1 font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Set Time
            </button>
          </div>

          {customTime && (
            <input
              id="departure-time-select"
              type="time"
              value={departureTime === 'now' ? '17:30' : departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="h-10 px-3 rounded-card bg-surface-solid border border-border text-sm font-mono text-ink shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          )}
        </div>
      </div>

      {/* 3. Budget Slider with Presets (PRD §14.5, §15.1) */}
      <div className="flex flex-col gap-1">
        <Slider
          value={budgetINR}
          min={10}
          max={300}
          step={1}
          onChange={setBudgetINR}
        />
        {validationErrors.budget && (
          <p className="text-xs text-warning font-medium mt-0.5">
            {validationErrors.budget}
          </p>
        )}
      </div>

      {/* Inline Top-Level Server Error (400, 429, problem+json) */}
      {error && (
        <div
          role="alert"
          className="p-3 rounded-card bg-warning/10 border border-warning/30 text-xs text-warning font-medium flex items-start gap-2"
        >
          <span className="shrink-0 font-bold">!</span>
          <span>{error}</span>
        </div>
      )}

      {/* 4. Primary CTA "Find Optimal Route" */}
      <PillButton
        type="submit"
        variant="primary"
        loading={isLoading}
        loadingText="Finding routes…"
        disabled={isLoading}
        icon={<Sparkles className="w-4 h-4" />}
        className="w-full mt-1"
      >
        Find Optimal Route
      </PillButton>
    </Surface>
  );
};
