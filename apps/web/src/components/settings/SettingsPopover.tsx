import React, { useEffect, useRef, useState } from 'react';
import { IconButton, PillButton, Surface } from '../ui/index.js';
import { usePlanStore } from '../../store/plan.js';
import { Check, Settings, Trash2, X } from 'lucide-react';

export interface SettingsPopoverProps {
  onRecentPlacesCleared?: () => void;
}

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  onRecentPlacesCleared,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [justCleared, setJustCleared] = useState<boolean>(false);
  const [recentCount, setRecentCount] = useState<number>(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updateRecentCount = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem('pr.recent');
        if (raw) {
          const parsed = JSON.parse(raw);
          setRecentCount(Object.keys(parsed).length);
          return;
        }
      }
    } catch {
      // Fallback
    }
    setRecentCount(0);
  };

  useEffect(() => {
    if (isOpen) {
      updateRecentCount();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleClearRecentPlaces = () => {
    usePlanStore.getState().clearRecentPlaces();
    setRecentCount(0);
    setJustCleared(true);
    onRecentPlacesCleared?.();

    setTimeout(() => {
      setJustCleared(false);
    }, 2400);
  };

  return (
    <div className="relative inline-block">
      <IconButton
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Settings and privacy"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="text-ink-muted hover:text-ink hover:bg-canvas"
      >
        <Settings className="w-4 h-4" />
      </IconButton>

      {isOpen && (
        <Surface
          ref={popoverRef}
          elevation="e3"
          role="dialog"
          aria-label="Settings & Privacy"
          className="absolute right-0 top-full mt-2 w-72 p-4 z-50 bg-surface-solid border border-border rounded-card shadow-e3 flex flex-col gap-3.5 text-ink text-left"
        >
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h3 className="font-display text-sm font-bold text-ink">
              Settings & Privacy
            </h3>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Close settings"
              onClick={() => {
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className="w-7 h-7 min-w-[28px] min-h-[28px]"
            >
              <X className="w-3.5 h-3.5" />
            </IconButton>
          </div>

          {/* Privacy & Recent Places (PRD §16) */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">
                Recent Places
              </span>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Stored locally on this device under{' '}
                <code className="font-mono text-[10px] bg-canvas px-1 py-0.5 rounded">
                  pr.recent
                </code>
                . Currently storing {recentCount} place
                {recentCount === 1 ? '' : 's'}.
              </p>
            </div>

            <PillButton
              variant="secondary"
              size="sm"
              onClick={handleClearRecentPlaces}
              className="text-xs justify-center"
            >
              {justCleared ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success mr-1.5" />
                  Cleared!
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 text-ink-muted mr-1.5" />
                  Clear recent places
                </>
              )}
            </PillButton>
          </div>

          {/* About & Attribution (PRD §16) */}
          <div className="pt-2 border-t border-border flex flex-col gap-1 text-[11px] text-ink-muted">
            <span className="font-semibold text-ink">PocketRoute Pune</span>
            <p className="leading-normal">
              OpenStreetMap (ODbL), OpenFreeMap, and Pune Metro data.
            </p>
          </div>
        </Surface>
      )}
    </div>
  );
};
