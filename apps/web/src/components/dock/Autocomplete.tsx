import React, { useEffect, useRef, useState } from 'react';
import type { StopPoint } from '@pocketroute/shared';
import { api, type GeoSearchResult } from '../../lib/api.js';
import { usePlanStore } from '../../store/plan.js';
import { MapPin, Navigation, Search, Star, X } from 'lucide-react';

export interface AutocompleteProps {
  id?: string;
  label: string;
  placeholder?: string;
  value: StopPoint | null;
  onChange: (point: StopPoint | null) => void;
  error?: string;
  autoFocus?: boolean;
  isStart?: boolean;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  id,
  label,
  placeholder = 'Search station or stop…',
  value,
  onChange,
  error,
  autoFocus = false,
  isStart = false,
}) => {
  const [query, setQuery] = useState<string>(value ? value.name : '');
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentPlaces = usePlanStore((state) => state.recentPlaces);
  const requestCurrentLocation = usePlanStore(
    (state) => state.requestCurrentLocation,
  );
  const isLocating = usePlanStore((state) => state.isLocating);
  const topRecent = recentPlaces.slice(0, 3);

  // Sync internal query text when value prop changes (e.g. on swap)
  useEffect(() => {
    setQuery(value ? value.name : '');
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 250 ms debounced autocomplete search (Step 4e)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setQuery(text);
    setHighlightedIndex(-1);

    if (value && text !== value.name) {
      onChange(null);
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text.trim()) {
      setResults([]);
      setIsLoading(false);
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const data = await api.searchGeo(text.trim(), 8);
        setResults(data.results || []);
        setIsOpen(true);
      } catch {
        // Fall back to matching recent places
        const localMatches: GeoSearchResult[] = recentPlaces
          .filter((p) => p.name.toLowerCase().includes(text.toLowerCase()))
          .map((p) => ({
            id: p.name,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            source: 'local' as const,
          }));
        setResults(localMatches);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    }, 250); // 250 ms debounce per Step 4e
  };

  const handleSelectPlace = (place: {
    name: string;
    lat: number;
    lng: number;
  }) => {
    setQuery(place.name);
    onChange({
      name: place.name,
      lat: place.lat,
      lng: place.lng,
    });
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    setQuery('');
    onChange(null);
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = getDisplayItems();
    if (!isOpen || items.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev <= 0 ? items.length - 1 : prev - 1,
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && items[highlightedIndex]) {
          handleSelectPlace(items[highlightedIndex]!);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Compute items to display in dropdown:
  // If query is empty, show top 3 recent picks with a star (PRD §14.5)
  const getDisplayItems = () => {
    if (!query.trim()) {
      return topRecent.map((p) => ({
        id: p.name,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        source: undefined as 'local' | 'osm' | undefined,
        transitStopId: undefined as string | undefined,
        isRecent: true,
      }));
    }

    return results.map((item) => {
      const isRecent = topRecent.some(
        (r) => r.name.toLowerCase() === item.name.toLowerCase(),
      );
      return {
        id: item.id,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        source: item.source,
        transitStopId: item.transitStopId,
        isRecent,
      };
    });
  };

  const displayItems = getDisplayItems();
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div ref={containerRef} className="relative w-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-ink-muted select-none"
        >
          {label}
        </label>
        <div className="flex items-center gap-2">
          {isStart && (
            <button
              type="button"
              onClick={() => {
                requestCurrentLocation();
                setIsOpen(false);
              }}
              disabled={isLocating}
              aria-label="Use Current Location"
              data-testid="use-current-location-chip"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 transition-all duration-150 disabled:opacity-50 cursor-pointer"
              title="Use Current GPS Location"
            >
              <Navigation
                className={`w-3 h-3 text-emerald-600 dark:text-emerald-400 ${
                  isLocating ? 'animate-spin' : ''
                }`}
              />
              <span>{isLocating ? 'Locating…' : 'Use Current Location'}</span>
            </button>
          )}
          {value && (
            <span className="font-mono text-[10px] text-success font-medium">
              Verified
            </span>
          )}
        </div>
      </div>

      <div className="relative flex items-center w-full">
        <span className="absolute left-3.5 text-ink-muted pointer-events-none flex items-center justify-center">
          <MapPin className="w-4 h-4 text-ink-muted" />
        </span>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={`w-full h-12 rounded-card bg-surface-solid border text-sm text-ink placeholder:text-ink-muted/60 pl-10 pr-10 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
            error
              ? 'border-warning/80 focus-visible:ring-warning'
              : 'border-border hover:border-ink/20 focus-visible:border-transparent'
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${label}`}
            className="absolute right-3 p-1 rounded-full text-ink-muted hover:text-ink hover:bg-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-warning font-medium mt-0.5">
          {error}
        </p>
      )}

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-card bg-surface-solid border border-border shadow-e3 py-1.5 flex flex-col text-sm text-ink"
        >
          {/* Top option for Start input: Use Current Location (PRD Section 22.2) */}
          {isStart && (
            <button
              type="button"
              onClick={() => {
                requestCurrentLocation();
                setIsOpen(false);
              }}
              disabled={isLocating}
              data-testid="use-current-location-dropdown-item"
              className="px-3.5 py-2.5 text-left flex items-center gap-2.5 border-b border-border/60 hover:bg-emerald-500/10 transition-colors text-emerald-700 dark:text-emerald-300 font-medium text-xs focus-visible:outline-none focus-visible:bg-emerald-500/15 cursor-pointer"
            >
              <Navigation
                className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 ${
                  isLocating ? 'animate-spin' : ''
                }`}
              />
              <div className="flex flex-col">
                <span className="font-semibold text-ink text-xs">
                  {isLocating
                    ? 'Locating GPS position…'
                    : 'Use Current Location'}
                </span>
                <span className="text-[10px] text-ink-muted">
                  Pune transit network GPS access
                </span>
              </div>
            </button>
          )}

          {isLoading ? (
            <div className="px-4 py-3 text-xs text-ink-muted flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span>Searching stops and places…</span>
            </div>
          ) : displayItems.length > 0 ? (
            <>
              {!query.trim() && topRecent.length > 0 && (
                <div className="px-3 py-1 text-[10px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1 border-b border-border/50">
                  <Star className="w-3 h-3 text-warning fill-warning" />
                  <span>Recent Places</span>
                </div>
              )}

              {displayItems.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${item.name}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onClick={() => handleSelectPlace(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors duration-100 ${
                      isHighlighted
                        ? 'bg-canvas text-ink font-medium'
                        : 'text-ink hover:bg-canvas/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {item.isRecent ? (
                        <Star className="w-3.5 h-3.5 text-warning fill-warning shrink-0" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.source && (
                        <span
                          data-testid="search-result-source"
                          className={`text-[9px] uppercase font-mono px-1 py-0.5 rounded font-semibold ${
                            item.source === 'osm'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                          }`}
                        >
                          {item.source}
                        </span>
                      )}
                      {item.isRecent && (
                        <span className="text-[10px] font-mono text-ink-muted shrink-0">
                          Recent
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          ) : query.trim() ? (
            <div className="px-4 py-3 text-xs text-ink-muted">
              No matching stations or landmarks found.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
