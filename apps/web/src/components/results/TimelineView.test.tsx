// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TimelineView } from './TimelineView.js';
import { RouteCard } from './RouteCard.js';
import type { Leg, Route } from '@pocketroute/shared';

describe('TimelineView and RouteCard (Step 5)', () => {
  afterEach(() => {
    cleanup();
  });

  const singleBusLeg: Leg = {
    mode: 'BUS',
    lineId: 'BUS_140',
    lineLabel: 'Bus 140',
    routeNumbers: ['140'],
    routeName: 'Upper Depot - Pune Station',
    headsign: 'Pune Station',
    boardingStop: 'Bibwewadi',
    alightingStop: 'Pune Station',
    stopCount: 4,
    from: { name: 'Bibwewadi', lat: 18.4695, lng: 73.8637 },
    to: { name: 'Pune Station', lat: 18.5288, lng: 73.8744 },
    departAt: '17:38',
    arriveAt: '18:02',
    scheduledDeparture: '17:38',
    scheduledArrival: '18:02',
    durationMin: 24,
    distanceKm: 7.2,
    fareINR: 20,
    waitMin: 4,
    waitMinutes: 4,
    frequencyMinutes: 10,
    nextDepartures: ['17:38', '17:48', '17:58'],
    scheduleBasis: 'estimate',
    intermediateStopsCount: 4,
    intermediateStops: [
      'Market Yard',
      'Swargate',
      'MG Road / Camp',
      'Collector Kacheri',
    ],
    geometry: { type: 'LineString', coordinates: [] },
    geometryQuality: 'estimated',
    instruction: 'Board Bus 140 towards Pune Station',
  };

  const parallelBusLeg: Leg = {
    ...singleBusLeg,
    routeNumbers: ['140', '23'],
  };

  const transferLeg1: Leg = {
    mode: 'BUS',
    lineId: 'BUS_140',
    lineLabel: 'Bus 140',
    routeNumbers: ['140'],
    routeName: 'Upper Depot - Swargate',
    boardingStop: 'Upper Depot',
    alightingStop: 'Swargate',
    stopCount: 3,
    from: { name: 'Upper Depot', lat: 18.455, lng: 73.865 },
    to: { name: 'Swargate', lat: 18.5015, lng: 73.8542 },
    departAt: '17:30',
    arriveAt: '17:45',
    durationMin: 15,
    distanceKm: 4.5,
    fareINR: 15,
    waitMin: 0,
    geometry: { type: 'LineString', coordinates: [] },
    geometryQuality: 'estimated',
    instruction: 'Board Bus 140 to Swargate',
  };

  const transferLeg2: Leg = {
    mode: 'BUS',
    lineId: 'BUS_29',
    lineLabel: 'Bus 29',
    routeNumbers: ['29'],
    routeName: 'Swargate - Hadapsar',
    boardingStop: 'Swargate',
    alightingStop: 'Hadapsar',
    stopCount: 5,
    transferAt: 'Swargate',
    transferWaitMinutes: 5,
    from: { name: 'Swargate', lat: 18.5015, lng: 73.8542 },
    to: { name: 'Hadapsar', lat: 18.508, lng: 73.926 },
    departAt: '17:50',
    arriveAt: '18:15',
    durationMin: 25,
    distanceKm: 8.5,
    fareINR: 20,
    waitMin: 5,
    geometry: { type: 'LineString', coordinates: [] },
    geometryQuality: 'estimated',
    instruction: 'Board Bus 29 to Hadapsar',
  };

  it('renders green bus pill with single route number', () => {
    render(<TimelineView legs={[singleBusLeg]} />);

    const primaryPill = screen.getByTestId('bus-pill-primary');
    expect(primaryPill.textContent).toContain('Bus 140');
    expect(screen.queryByTestId('bus-pill-secondary')).toBeNull();
  });

  it('renders green bus pill with primary and secondary numbers ("or Bus 23")', () => {
    render(<TimelineView legs={[parallelBusLeg]} />);

    const primaryPill = screen.getByTestId('bus-pill-primary');
    const secondaryPill = screen.getByTestId('bus-pill-secondary');
    expect(primaryPill.textContent).toContain('Bus 140');
    expect(secondaryPill.textContent).toContain('or Bus 23');
  });

  it('renders expandable stop list with aria-expanded toggling', () => {
    render(<TimelineView legs={[singleBusLeg]} />);

    const expandBtn = screen.getByTestId('expand-stops-btn');
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Market Yard/)).toBeNull();

    fireEvent.click(expandBtn);
    expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Market Yard/)).toBeDefined();
    expect(screen.getByText(/Swargate/)).toBeDefined();

    fireEvent.click(expandBtn);
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders transfer divider between two bus legs with hub and wait time', () => {
    render(<TimelineView legs={[transferLeg1, transferLeg2]} />);

    const divider = screen.getByTestId('bus-transfer-divider');
    expect(divider).toBeDefined();
    expect(divider.textContent).toContain('Change Bus at Swargate');
    expect(divider.textContent).toContain('Wait 5 mins');
  });

  it('renders schedule pill with 12-hour departure/arrival, headway, and estimate label', () => {
    render(<TimelineView legs={[singleBusLeg]} />);

    const schedulePill = screen.getByTestId('schedule-pill');
    expect(schedulePill).toBeDefined();
    expect(schedulePill.textContent).toContain('Departs 5:38 PM');
    expect(schedulePill.textContent).toContain('Arrives 6:02 PM');
    expect(schedulePill.textContent).toContain('Every 10 mins');
    expect(schedulePill.textContent).toContain(
      'Next buses from Bibwewadi: 5:38 PM, 5:48 PM, 5:58 PM',
    );
    expect(schedulePill.textContent).toContain('Scheduled estimate, not live');
  });

  it('renders daily pass tip badge when plan tip flag is set with warning border', () => {
    render(
      <TimelineView
        legs={[singleBusLeg]}
        dailyPassTip="Tip: Buy ₹70 PMPML Daily Pass (price unverified)"
      />,
    );

    const badge = screen.getByTestId('daily-pass-tip-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Tip: Buy ₹70 PMPML Daily Pass');
    expect(badge.className).toContain('border-warning');
  });

  it('provides single sentence aria-label for accessibility on legs', () => {
    render(<TimelineView legs={[singleBusLeg]} />);

    const legButton = screen.getByRole('button', {
      name: /Leg 1: Board Bus 140 at 5:38 PM from Bibwewadi/i,
    });
    expect(legButton).toBeDefined();
  });

  it('RouteCard renders bus pills for route alternatives', () => {
    const mockRoute: Route = {
      feasible: true,
      totalFareINR: 20,
      arrivalTime: '18:02',
      durationMin: 24,
      legs: [parallelBusLeg],
    };

    render(
      <RouteCard
        type="smart"
        route={mockRoute}
        selected={true}
        onSelect={() => {}}
      />,
    );

    const primaryPill = screen.getByTestId('bus-pill-primary');
    const secondaryPill = screen.getByTestId('bus-pill-secondary');
    expect(primaryPill.textContent).toContain('Bus 140');
    expect(secondaryPill.textContent).toContain('or Bus 23');
    expect(screen.getByText('₹20')).toBeDefined();
  });
});
