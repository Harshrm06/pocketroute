import React, { Suspense } from 'react';
import { MapSkeleton } from './MapSkeleton.js';
import type { MapViewHandle, MapViewProps } from './types.js';

// Lazy-load the MapLibre chunk (PRD §11.1, §16)
const LazyMapLibre = React.lazy(() =>
  import('./MapLibreInternal.js').then((module) => ({
    default: module.MapLibreInternal,
  })),
);

export const MapView = React.forwardRef<MapViewHandle, MapViewProps>(
  (props, ref) => {
    return (
      <Suspense fallback={<MapSkeleton />}>
        <LazyMapLibre {...props} ref={ref} />
      </Suspense>
    );
  },
);

MapView.displayName = 'MapView';

export * from './types.js';
export { MapSkeleton } from './MapSkeleton.js';
