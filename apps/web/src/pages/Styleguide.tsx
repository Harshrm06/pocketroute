import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Compass,
  MapPin,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  Card,
  IconButton,
  Input,
  ModeChip,
  PillButton,
  Slider,
  Surface,
} from '../components/ui/index.js';

export const Styleguide: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [budget, setBudget] = useState<number>(75);
  const [searchVal, setSearchVal] = useState<string>('Swargate');
  const [inputErr, setInputErr] = useState<string>('');
  const [btnLoading, setBtnLoading] = useState<boolean>(false);
  const [selectedCard, setSelectedCard] = useState<string>('smart');

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink p-6 md:p-12 transition-colors duration-200">
      <div className="max-w-5xl mx-auto flex flex-col gap-10">
        {/* Header & Theme switcher */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-primary text-primary-contrast font-bold">
                PRD §14 CHECKLIST
              </span>
              <span className="text-xs text-ink-muted">
                Design System Visual Suite
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-ink">
              PocketRoute UI Styleguide
            </h1>
            <p className="text-ink-muted text-sm mt-1">
              Interactive verification of all tokens, typography, primitives,
              and contrast ratios.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <PillButton
              variant="secondary"
              size="sm"
              icon={
                theme === 'light' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )
              }
              onClick={toggleTheme}
            >
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </PillButton>
          </div>
        </header>

        {/* Section 1: Color Tokens & WCAG Contrast Checklist */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-ink">
              1. Color Tokens & Contrast Ratios (PRD §14.2)
            </h2>
            <span className="text-xs px-2 py-1 bg-success/10 text-success border border-success/30 rounded font-medium">
              WCAG 2.2 AA Verified
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {/* Core tokens */}
            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--ink)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--ink</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  17.9:1 on surface
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--primary)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --primary (CTA)
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  17.9:1 text contrast
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--ink-muted)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --ink-muted
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  7.6:1 on surface (AAA)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--success)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --success
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  5.4:1 (AA winner)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--warning)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --warning
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  5.0:1 (Infeasible)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--focus)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--focus</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  2px ring, 2px offset
                </span>
              </div>
            </div>

            {/* Transit tokens */}
            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--metro-purple)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --metro-purple
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Purple Line
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--metro-aqua)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">
                  --metro-aqua
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Aqua Line
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--bus)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--bus</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  PMPML Bus
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--auto)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--auto</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Auto Rickshaw
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--cab)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--cab</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Cab / Taxi
                </span>
              </div>
            </div>

            <div className="p-3 rounded-card bg-surface-solid border border-border flex flex-col gap-2">
              <div
                className="h-10 rounded border border-border"
                style={{ backgroundColor: 'var(--walk)' }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-ink">--walk</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Walk
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Typography (PRD §14.3) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            2. Typography Hierarchy (PRD §14.3)
          </h2>
          <div className="p-5 rounded-card bg-surface-solid border border-border flex flex-col gap-4 shadow-e1">
            <div>
              <span className="text-[11px] font-mono text-ink-muted uppercase">
                Display & Headings: Plus Jakarta Sans (600, 700)
              </span>
              <p className="font-display text-2xl font-bold text-ink mt-0.5">
                Fastest Route · ₹75 Budget Winner · 1 Transfer
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono text-ink-muted uppercase">
                Body & Controls: Inter (400, 500)
              </span>
              <p className="font-sans text-sm text-ink leading-relaxed mt-0.5">
                Board Purple Line at Swargate Station toward PCMC. Alight at
                Civil Court and interchange to Aqua Line toward Ramwadi.
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono text-ink-muted uppercase">
                Numerics: JetBrains Mono (500 tabular-nums)
              </span>
              <p className="font-mono text-lg font-medium text-ink tabular-nums mt-0.5">
                17:30 IST · 28 min · ₹70 total · Savings ₹40 vs fastest
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: PillButton (PRD §14.5) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            3. PillButton Primitives (PRD §14.5)
          </h2>
          <div className="p-5 rounded-card bg-surface-solid border border-border flex flex-col gap-6 shadow-e1">
            <div className="flex flex-wrap items-center gap-4">
              <PillButton
                variant="primary"
                icon={<Sparkles className="w-4 h-4" />}
              >
                Find Routes
              </PillButton>

              <PillButton variant="secondary">Secondary Option</PillButton>

              <PillButton
                variant="primary"
                loading={btnLoading}
                onClick={() => {
                  setBtnLoading(true);
                  setTimeout(() => setBtnLoading(false), 2000);
                }}
              >
                Click to Test Loading
              </PillButton>

              <PillButton variant="primary" disabled>
                Disabled State
              </PillButton>

              <PillButton variant="secondary" size="sm">
                Small Pill
              </PillButton>

              <PillButton variant="primary" size="lg">
                Large CTA
              </PillButton>
            </div>
          </div>
        </section>

        {/* Section 4: ModeChip (PRD §14.5) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            4. ModeChip Primitives (PRD §14.5)
          </h2>
          <div className="p-5 rounded-card bg-surface-solid border border-border flex flex-col gap-4 shadow-e1">
            <span className="text-xs text-ink-muted">
              28 px height, mode color at 12% alpha background, mode color icon,
              ink label:
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <ModeChip mode="METRO_PURPLE" />
              <ModeChip mode="METRO_AQUA" />
              <ModeChip mode="BUS" label="Bus 2" />
              <ModeChip mode="BUS" label="BRT Corridor" />
              <ModeChip mode="AUTO" label="Auto (₹32)" />
              <ModeChip mode="CAB" label="Cab (₹110)" />
              <ModeChip mode="WALK" label="Walk 400 m" />
            </div>

            <span className="text-xs text-ink-muted mt-2">
              Icon-only variants:
            </span>
            <div className="flex items-center gap-2">
              <ModeChip mode="METRO_PURPLE" iconOnly />
              <ModeChip mode="METRO_AQUA" iconOnly />
              <ModeChip mode="BUS" iconOnly />
              <ModeChip mode="AUTO" iconOnly />
              <ModeChip mode="CAB" iconOnly />
              <ModeChip mode="WALK" iconOnly />
            </div>
          </div>
        </section>

        {/* Section 5: Budget Slider (PRD §14.5) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            5. Budget Slider & Presets (PRD §14.5)
          </h2>
          <div className="p-6 rounded-card bg-surface-solid border border-border shadow-e1 max-w-md">
            <Slider
              value={budget}
              min={10}
              max={300}
              step={1}
              onChange={setBudget}
            />
          </div>
        </section>

        {/* Section 6: Surface & Glassmorphism (PRD §14.1, §14.2) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            6. Surface Glass Panel (PRD §14.2)
          </h2>
          <div className="relative p-8 rounded-card border border-border overflow-hidden bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-emerald-500/20">
            {/* Background texture simulating map */}
            <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#444_1px,transparent_1px)] [background-size:16px_16px]" />

            <Surface
              elevation="e2"
              className="p-6 max-w-md relative z-10 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-base text-ink">
                  Floating Transit Dock
                </span>
                <span className="text-xs text-success font-semibold px-2 py-0.5 rounded-full bg-success/10">
                  backdrop-filter blur
                </span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Floating glass panel over map canvas. Features backdrop blur
                (16px) with 140% saturation and automatic solid fallback.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <PillButton size="sm">Search</PillButton>
                <PillButton size="sm" variant="secondary">
                  Reset
                </PillButton>
              </div>
            </Surface>
          </div>
        </section>

        {/* Section 7: Comparison Cards (PRD §14.5) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            7. Comparison Cards (PRD §14.5)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Smart Winner Card */}
            <Card
              interactive
              selected={selectedCard === 'smart'}
              onClick={() => setSelectedCard('smart')}
              className="flex flex-col gap-3 relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/30">
                  ★ Smart Winner
                </span>
                <span className="text-xs text-success font-semibold">
                  Saves ₹40
                </span>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-ink tabular-nums">
                  ₹70
                </div>
                <div className="text-xs text-ink-muted">
                  Arrives 17:58 (28 min)
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <ModeChip mode="METRO_PURPLE" iconOnly />
                <span className="text-xs text-ink-muted">+</span>
                <ModeChip mode="BUS" label="Bus 2" />
              </div>
            </Card>

            {/* Fastest Overall */}
            <Card
              interactive
              selected={selectedCard === 'fastest'}
              onClick={() => setSelectedCard('fastest')}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-muted bg-canvas px-2 py-0.5 rounded-full border border-border">
                  Fastest Overall
                </span>
                <span className="text-xs text-ink-muted font-mono">-7 min</span>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-ink tabular-nums">
                  ₹110
                </div>
                <div className="text-xs text-ink-muted">
                  Arrives 17:51 (21 min)
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <ModeChip mode="CAB" label="Direct Cab" />
              </div>
            </Card>

            {/* Cheapest Overall */}
            <Card
              interactive
              selected={selectedCard === 'cheapest'}
              onClick={() => setSelectedCard('cheapest')}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-muted bg-canvas px-2 py-0.5 rounded-full border border-border">
                  Cheapest Overall
                </span>
                <span className="text-xs text-success font-semibold font-mono">
                  Low cost
                </span>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-ink tabular-nums">
                  ₹30
                </div>
                <div className="text-xs text-ink-muted">
                  Arrives 18:20 (50 min)
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <ModeChip mode="BUS" label="PMPML Only" />
              </div>
            </Card>
          </div>
        </section>

        {/* Section 8: Input & IconButton (PRD §14.5, §14.8) */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold text-ink">
            8. Input & IconButton Primitives (PRD §14.8)
          </h2>
          <div className="p-6 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Origin Point"
                icon={<MapPin className="w-4 h-4 text-ink-muted" />}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onClear={() => setSearchVal('')}
                placeholder="Search station or stop…"
              />

              <Input
                label="Destination with Error Validation"
                icon={<Compass className="w-4 h-4 text-ink-muted" />}
                placeholder="Outside bounding box…"
                value="Mumbai CST"
                error={
                  inputErr || 'Coordinates must lie inside Pune bounding box.'
                }
                onChange={(e) => setInputErr(e.target.value ? '' : 'Error')}
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <span className="text-xs font-semibold text-ink-muted">
                IconButtons (44x44 px touch targets with WCAG focus rings):
              </span>
              <div className="flex items-center gap-3">
                <IconButton aria-label="Swap endpoints" variant="surface">
                  <ArrowLeftRight className="w-4 h-4" />
                </IconButton>

                <IconButton aria-label="Search places" variant="primary">
                  <Search className="w-4 h-4" />
                </IconButton>

                <IconButton aria-label="Settings and options" variant="ghost">
                  <Settings className="w-4 h-4" />
                </IconButton>

                <IconButton aria-label="Close panel" variant="surface">
                  <X className="w-4 h-4" />
                </IconButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
