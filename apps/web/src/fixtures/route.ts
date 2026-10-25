import type { Route } from '@pocketroute/shared';

/**
 * Fixture route set demonstrating all four layers and modes:
 * 1. One walk leg (animated dashed blue)
 * 2. One metro leg (solid purple)
 * 3. One bus leg (solid emerald)
 * 4. One estimated leg (dashed amber with "estimated path" label)
 */
export const fixtureRoute: Route = {
  feasible: true,
  totalFareINR: 45,
  departureTime: '17:30',
  arrivalTime: '18:08',
  durationMin: 38,
  totalDistanceKm: 6.8,
  legs: [
    // 1. Walk Leg (Swargate Bus Stand -> Swargate Metro)
    {
      mode: 'WALK',
      lineId: 'WALK',
      lineLabel: 'Walk',
      from: {
        name: 'Swargate Bus Stand',
        lat: 18.5008,
        lng: 73.8575,
      },
      to: {
        name: 'Swargate Metro Station',
        lat: 18.5018,
        lng: 73.858,
      },
      departAt: '17:30',
      arriveAt: '17:34',
      durationMin: 4,
      distanceKm: 0.3,
      stopCount: 0,
      waitMin: 0,
      fareINR: 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.8575, 18.5008],
          [73.8577, 18.5012],
          [73.858, 18.5018],
        ],
      },
      geometryQuality: 'exact',
      instruction: 'Walk 300 m north to Swargate Metro Station entrance.',
    },

    // 2. Metro Leg (Swargate -> Civil Court on METRO_PURPLE)
    {
      mode: 'METRO',
      lineId: 'METRO_PURPLE',
      lineLabel: 'Purple Line',
      from: {
        name: 'Swargate Metro Station',
        lat: 18.5018,
        lng: 73.858,
      },
      to: {
        name: 'Civil Court Metro Station',
        lat: 18.5284,
        lng: 73.8567,
      },
      departAt: '17:38',
      arriveAt: '17:48',
      durationMin: 10,
      distanceKm: 3.5,
      stopCount: 4,
      waitMin: 4,
      fareINR: 15,
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.858, 18.5018],
          [73.8573, 18.5065],
          [73.8565, 18.5135],
          [73.8558, 18.521],
          [73.8567, 18.5284],
        ],
      },
      geometryQuality: 'exact',
      instruction: 'Board Purple Line toward PCMC. Alight at Civil Court.',
    },

    // 3. Bus Leg (Civil Court -> Pune Station on Bus 2)
    {
      mode: 'BUS',
      lineId: 'BUS_2',
      lineLabel: 'Bus 2',
      from: {
        name: 'Civil Court Metro Station',
        lat: 18.5284,
        lng: 73.8567,
      },
      to: {
        name: 'Pune Railway Station',
        lat: 18.5289,
        lng: 73.8744,
      },
      departAt: '17:52',
      arriveAt: '18:02',
      durationMin: 10,
      distanceKm: 2.1,
      stopCount: 5,
      waitMin: 4,
      fareINR: 10,
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.8567, 18.5284],
          [73.8615, 18.5292],
          [73.8665, 18.5305],
          [73.8705, 18.5298],
          [73.8744, 18.5289],
        ],
      },
      geometryQuality: 'exact',
      instruction: 'Board PMPML Bus 2 toward Pune Station.',
    },

    // 4. Estimated Geometry Leg (Pune Station -> Collector Office, Auto)
    {
      mode: 'AUTO',
      lineId: 'AUTO',
      lineLabel: 'Auto Rickshaw',
      from: {
        name: 'Pune Railway Station',
        lat: 18.5289,
        lng: 73.8744,
      },
      to: {
        name: 'Collector Office',
        lat: 18.5255,
        lng: 73.87,
      },
      departAt: '18:04',
      arriveAt: '18:08',
      durationMin: 4,
      distanceKm: 0.9,
      stopCount: 0,
      waitMin: 2,
      fareINR: 20,
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.8744, 18.5289],
          [73.8728, 18.5278],
          [73.8712, 18.5264],
          [73.87, 18.5255],
        ],
      },
      geometryQuality: 'estimated',
      instruction: 'Take an auto to Collector Office (estimated path).',
    },
  ],
};
