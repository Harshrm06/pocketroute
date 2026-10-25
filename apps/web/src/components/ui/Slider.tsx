import React from 'react';

export interface SliderPreset {
  label: string;
  subtitle: string;
  value: number;
}

export const BUDGET_PRESETS: SliderPreset[] = [
  { label: '₹30', subtitle: 'Broke Student', value: 30 },
  { label: '₹60', subtitle: 'Smart Commute', value: 60 },
  { label: '₹120', subtitle: 'Fast Mix', value: 120 },
];

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  showPresets?: boolean;
  className?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min = 10,
  max = 300,
  step = 1,
  onChange,
  showPresets = true,
  className = '',
  disabled = false,
}) => {
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / (max - min)) * 100),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className={`w-full flex flex-col gap-3 ${className}`}>
      {/* Slider Header with live mono value */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="budget-slider"
          className="text-xs font-semibold text-ink-muted uppercase tracking-wider select-none"
        >
          Max Budget
        </label>
        <span className="font-mono text-base font-bold text-ink tabular-nums bg-surface-solid px-2 py-0.5 rounded border border-border shadow-e1">
          ₹{value}
        </span>
      </div>

      {/* Range track & thumb */}
      <div className="relative flex items-center w-full h-8 py-2">
        {/* Visual Track */}
        <div className="w-full h-2 rounded-full bg-border overflow-hidden relative">
          <div
            style={{ width: `${percentage}%` }}
            className="h-full bg-primary transition-[width] duration-75 ease-out rounded-full"
          />
        </div>

        {/* Visual Thumb representation */}
        <div
          style={{ left: `calc(${percentage}% - 12px)` }}
          className="absolute w-6 h-6 rounded-full bg-surface-solid border border-border shadow-e2 pointer-events-none transition-[left] duration-75 ease-out flex items-center justify-center ring-2 ring-primary/20"
        >
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>

        {/* Interactive native range input overlaid */}
        <input
          id="budget-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleInputChange}
          aria-label="Trip Budget in INR"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none"
        />
      </div>

      {/* Preset pills per PRD §14.5 */}
      {showPresets && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {BUDGET_PRESETS.map((preset) => {
            const isSelected = value === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset.value)}
                className={`flex-1 min-w-[90px] py-1.5 px-2.5 rounded-pill text-xs font-medium border transition-all duration-150 ease-out flex flex-col items-center justify-center select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                  isSelected
                    ? 'bg-primary text-primary-contrast border-primary shadow-e1'
                    : 'bg-surface-solid text-ink border-border hover:bg-canvas/50'
                }`}
              >
                <span className="font-bold font-mono tabular-nums leading-tight">
                  {preset.label}
                </span>
                <span
                  className={`text-[10px] leading-tight ${
                    isSelected ? 'text-primary-contrast/80' : 'text-ink-muted'
                  }`}
                >
                  {preset.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
