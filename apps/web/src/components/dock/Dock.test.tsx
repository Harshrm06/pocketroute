// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { Dock } from './Dock.js';
import { usePlanStore } from '../../store/plan.js';
import type { PlanResponse } from '@pocketroute/shared';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockPlanResponse: PlanResponse = {
  requestId: 'test-req-123',
  budgetINR: 75,
  infeasible: null,
  routes: {
    smart: {
      feasible: true,
      totalFareINR: 35,
      arrivalTime: '17:58',
      durationMin: 28,
      legs: [],
    },
    fastest: {
      feasible: true,
      totalFareINR: 75,
      arrivalTime: '17:51',
      durationMin: 21,
      legs: [],
    },
    cheapest: {
      feasible: true,
      totalFareINR: 20,
      arrivalTime: '18:15',
      durationMin: 45,
      legs: [],
    },
  },
  comparison: {
    fareSavedVsFastestINR: 40,
    extraMinVsFastest: 7,
  },
};

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) =>
    storageMap.set(key, String(value)),
  ),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((idx: number) => Array.from(storageMap.keys())[idx] ?? null),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Dock Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    usePlanStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all form controls and default budget ₹75', () => {
    render(<Dock />);

    expect(screen.getByLabelText('Starting Point')).toBeDefined();
    expect(screen.getByLabelText('Destination')).toBeDefined();
    expect(screen.getByRole('button', { name: /Now \(IST\)/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Find Optimal Route/i }),
    ).toBeDefined();
    expect(screen.getByText('₹75')).toBeDefined();
  });

  it('validates missing origin and destination with inline errors', async () => {
    render(<Dock />);

    const submitBtn = screen.getByRole('button', {
      name: /Find Optimal Route/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Please select a starting location.'),
      ).toBeDefined();
      expect(screen.getByText('Please select a destination.')).toBeDefined();
    });
  });

  it('validates identical start and end locations', async () => {
    usePlanStore.setState({
      origin: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
      destination: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
    });

    render(<Dock />);

    const submitBtn = screen.getByRole('button', {
      name: /Find Optimal Route/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Start and End points must be different.'),
      ).toBeDefined();
    });
  });

  it('updates slider budget when selecting preset pills', async () => {
    render(<Dock />);

    // Click Broke Student ₹30
    const brokeBtn = screen.getByRole('button', { name: /Broke Student/i });
    fireEvent.click(brokeBtn);
    expect(usePlanStore.getState().budgetINR).toBe(30);
    expect(screen.getAllByText('₹30').length).toBeGreaterThanOrEqual(1);

    // Click Smart Commute ₹60
    const smartBtn = screen.getByRole('button', { name: /Smart Commute/i });
    fireEvent.click(smartBtn);
    expect(usePlanStore.getState().budgetINR).toBe(60);
    expect(screen.getAllByText('₹60').length).toBeGreaterThanOrEqual(1);

    // Click Fast Mix ₹120
    const fastBtn = screen.getByRole('button', { name: /Fast Mix/i });
    fireEvent.click(fastBtn);
    expect(usePlanStore.getState().budgetINR).toBe(120);
    expect(screen.getAllByText('₹120').length).toBeGreaterThanOrEqual(1);
  });

  it('swaps origin and destination endpoints on swap button click', () => {
    usePlanStore.setState({
      origin: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
      destination: { name: 'Civil Court', lat: 18.5284, lng: 73.8567 },
    });

    render(<Dock />);

    const swapBtn = screen.getByLabelText(/Swap origin and destination/i);
    fireEvent.click(swapBtn);

    expect(usePlanStore.getState().origin?.name).toBe('Civil Court');
    expect(usePlanStore.getState().destination?.name).toBe('Swargate');
  });

  it('submits valid route plan calling API and populating store result', async () => {
    usePlanStore.setState({
      origin: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
      destination: { name: 'Civil Court', lat: 18.5284, lng: 73.8567 },
      budgetINR: 75,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockPlanResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    render(<Dock onSuccess={onSuccess} />);

    const submitBtn = screen.getByRole('button', {
      name: /Find Optimal Route/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(usePlanStore.getState().status).toBe('ready');
      expect(usePlanStore.getState().result).toEqual(mockPlanResponse);
      expect(onSuccess).toHaveBeenCalled();
    });

    // Check recent places persisted in localStorage under pr.recent
    const storedRecent = localStorageMock.getItem('pr.recent');
    expect(storedRecent).not.toBeNull();
    expect(storedRecent).toContain('Swargate');
    expect(storedRecent).toContain('Civil Court');
  });

  it('handles 400 Bad Request with problem+json message', async () => {
    usePlanStore.setState({
      origin: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
      destination: { name: 'Civil Court', lat: 18.5284, lng: 73.8567 },
      budgetINR: 75,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/problem+json' }),
      json: async () => ({
        type: 'https://pocketroute.example/errors/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Coordinates must lie inside Pune bounding box.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Dock />);

    const submitBtn = screen.getByRole('button', {
      name: /Find Optimal Route/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Coordinates must lie inside Pune bounding box.'),
      ).toBeDefined();
      expect(usePlanStore.getState().status).toBe('error');
    });
  });

  it('handles 429 Rate Limit with friendly message', async () => {
    usePlanStore.setState({
      origin: { name: 'Swargate', lat: 18.5018, lng: 73.858 },
      destination: { name: 'Civil Court', lat: 18.5284, lng: 73.8567 },
      budgetINR: 75,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'content-type': 'application/problem+json' }),
      json: async () => ({
        title: 'Too Many Requests',
        status: 429,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Dock />);

    const submitBtn = screen.getByRole('button', {
      name: /Find Optimal Route/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Too many route requests. Please wait a moment before trying again.',
        ),
      ).toBeDefined();
      expect(usePlanStore.getState().status).toBe('error');
    });
  });

  it('displays notice when departure time is between 22:00 and 06:00 (metro closed)', async () => {
    usePlanStore.setState({
      departureTime: '22:30',
    });

    render(<Dock />);

    expect(screen.getByTestId('metro-closed-notice')).toBeDefined();
    expect(
      screen.getByText(
        'Metro is closed at this time. Routed via bus and auto.',
      ),
    ).toBeDefined();
  });

  it('does not display notice when departure time is within metro operating hours (e.g. 17:30)', async () => {
    usePlanStore.setState({
      departureTime: '17:30',
    });

    render(<Dock />);

    expect(screen.queryByTestId('metro-closed-notice')).toBeNull();
  });

  it('debounces place search by 250ms and renders source labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'pl_vit',
            name: 'VIT Pune',
            lat: 18.4636,
            lng: 73.8682,
            source: 'local',
          },
          {
            id: 'osm_999',
            name: 'VIT Hostel Live',
            lat: 18.464,
            lng: 73.869,
            source: 'osm',
          },
        ],
        liveSearch: 'available',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Dock />);

    const startInput = screen.getByLabelText('Starting Point');
    fireEvent.change(startInput, { target: { value: 'VIT' } });

    // Immediately after typing, /geo/search should NOT have been called due to 250ms debounce
    const geoCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/geo/search'),
    );
    expect(geoCallsBefore.length).toBe(0);

    // After debounce interval, searchGeo endpoint is called and source labels are rendered
    await waitFor(
      () => {
        const geoCallsAfter = fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes('/geo/search'),
        );
        expect(geoCallsAfter.length).toBeGreaterThan(0);
        const sourceLabels = screen.getAllByTestId('search-result-source');
        expect(sourceLabels.length).toBe(2);
        expect(sourceLabels[0]?.textContent).toBe('local');
        expect(sourceLabels[1]?.textContent).toBe('osm');
      },
      { timeout: 1000 },
    );
  });

  it('selects a non-stop custom point from search results and passes coordinates to plan store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        results: [
          {
            id: 'pl_vit_custom',
            name: 'VIT College Gate',
            lat: 18.4636,
            lng: 73.8682,
            source: 'local',
          },
        ],
        liveSearch: 'available',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Dock />);

    const startInput = screen.getByLabelText('Starting Point');
    fireEvent.change(startInput, { target: { value: 'VIT' } });

    await waitFor(() => {
      expect(screen.getByText('VIT College Gate')).toBeDefined();
    });

    const optionBtn = screen.getByRole('option', { name: /VIT College Gate/i });
    fireEvent.click(optionBtn);

    const currentOrigin = usePlanStore.getState().origin;
    expect(currentOrigin).not.toBeNull();
    expect(currentOrigin?.name).toBe('VIT College Gate');
    expect(currentOrigin?.lat).toBe(18.4636);
    expect(currentOrigin?.lng).toBe(73.8682);
  });
});
