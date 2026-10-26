/**
 * State-graph types for the line-expanded multi-modal planner.
 * PRD Sections 7.1–7.5.
 */
import type { GeometryQuality, LineId, Mode } from '@pocketroute/shared';

// ---------------------------------------------------------------------------
// Node identifiers
// ---------------------------------------------------------------------------

/** Physical node identifier: station/stop id, or "O" / "D". */
export type NodeId = string;

/**
 * State = (node, lastLine).  Encoded as `${nodeId}|${lineId}`.
 * PRD §7.2: The state count is |V| × |L|.
 */
export type StateId = string;

/** Encodes a (nodeId, lineId) pair into a StateId string. */
export function encodeState(nodeId: NodeId, lineId: LineId | 'NONE'): StateId {
  return `${nodeId}|${lineId}`;
}

/** Decodes a StateId string into its constituent nodeId and lineId. */
export function decodeState(stateId: StateId): {
  nodeId: NodeId;
  lineId: LineId | 'NONE';
} {
  const sep = stateId.indexOf('|');
  if (sep === -1) {
    throw new Error(`Invalid StateId: "${stateId}"`);
  }
  return {
    nodeId: stateId.slice(0, sep),
    lineId: stateId.slice(sep + 1) as LineId | 'NONE',
  };
}

// ---------------------------------------------------------------------------
// Edge metadata
// ---------------------------------------------------------------------------

export interface EdgeMeta {
  /** Road distance of this edge, in km. */
  distanceKm: number;
  /** Number of intermediate stops (for transit legs). */
  stops: number;
  /** Optional reference to a precomputed geometry file or key. */
  geometryRef?: string;
  /** Quality flag for geometry. */
  geometryQuality: GeometryQuality;
}

// ---------------------------------------------------------------------------
// Graph edge
// ---------------------------------------------------------------------------

/**
 * A directed edge in the state graph.
 * PRD §7.2: Edge = (state (v, l) → state (w, m), fare f ≥ 0, time τ(t)).
 */
export interface Edge {
  /** Source state. */
  from: StateId;
  /** Target state. */
  to: StateId;
  /** Line identifier: METRO_PURPLE, BUS_2, WALK, AUTO, CAB, etc. */
  line: LineId;
  /** Transport mode. */
  mode: Mode;
  /** Fare in INR (integer, ≥ 0). */
  fareINR: number;
  /** Minimum possible travel time along this edge, in minutes. */
  minTimeMin: number;
  /**
   * Time function τ(t): given arrival time at the source node (minutes since
   * midnight IST), returns the arrival time at the target node.
   * Returns Infinity if no service is available.
   * Must satisfy FIFO: if t1 ≤ t2 then timeAt(t1) ≤ timeAt(t2).
   */
  timeAt: (t: number) => number;
  /** Metadata for route reconstruction and rendering. */
  meta: EdgeMeta;
}

// ---------------------------------------------------------------------------
// Graph container
// ---------------------------------------------------------------------------

/** Node metadata stored in the graph. */
export interface GraphNode {
  id: NodeId;
  name: string;
  lat: number;
  lng: number;
  /** Node classification per PRD §7.1. */
  type: 'origin' | 'destination' | 'metro_station' | 'bus_stop';
  /** Which line(s) serve this node. */
  lines: (LineId | 'NONE')[];
}

/**
 * Adjacency-list graph with per-state outgoing edges.
 * The key is a StateId, and the value is the list of outgoing edges from
 * that state.
 */
export interface StateGraph {
  /** All nodes in the graph, keyed by NodeId. */
  nodes: Map<NodeId, GraphNode>;
  /** Adjacency list: outgoing edges from each StateId. */
  adj: Map<StateId, Edge[]>;
  /** Outgoing edges indexed by physical NodeId for fast state-graph search. */
  nodeAdj: Map<NodeId, Edge[]>;
  /** Total edge count (cached). */
  edgeCount: number;
  /** Total number of line identifiers. */
  lineCount: number;
}

/**
 * Returns outgoing edges from a state s = (v, l), enforcing Rule C
 * (PRD §7.4: two consecutive edges may not share the same line identifier l).
 */
export function getOutgoingEdges(graph: StateGraph, state: StateId): Edge[] {
  const { nodeId, lineId } = decodeState(state);
  const edges = graph.nodeAdj?.get(nodeId) ?? [];
  if (lineId === 'NONE') return edges;
  return edges.filter((e) => e.line !== lineId);
}

/**
 * Returns all edges departing from a physical node.
 */
export function getEdgesFromNode(graph: StateGraph, nodeId: NodeId): Edge[] {
  return graph.nodeAdj?.get(nodeId) ?? [];
}

// ---------------------------------------------------------------------------
// Network data input types (raw data from JSON files)
// ---------------------------------------------------------------------------

export interface MetroStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  interchangeWith?: string[];
  verified?: boolean;
}

export interface MetroLine {
  id: string;
  name: string;
  corridor: string;
  color: string;
  stations: MetroStation[];
}

export interface MetroData {
  effectiveFrom?: string;
  lines: MetroLine[];
}

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  segmentDistanceKm: number;
}

export interface BusRoute {
  routeNo: string;
  label: string;
  firstDeparture: number;
  peakHeadway: number;
  offPeakHeadway: number;
  verified?: boolean;
  notes?: string;
  stops: BusStop[];
}

export interface BusRoutesData {
  effectiveFrom?: string;
  routes: BusRoute[];
}

/** Combined network data for graph construction. */
export interface NetworkData {
  metro: MetroData;
  bus: BusRoutesData;
}

/** Options passed when building a query graph. */
export interface QueryGraphOptions {
  maxWalkM: number;
  includeAuto: boolean;
  includeCab: boolean;
  /** Maximum distance in km for auto/cab feeder edges. Default 4. */
  feederRadiusKm?: number;
  /** k-nearest for auto/cab feeder edges. Default 8. */
  feederK?: number;
  /** Max candidate stops to consider near origin/destination. Default 60. */
  maxCandidateStops?: number;
  /** Query departure time in minutes from midnight IST. */
  depMinutes?: number;
  /** Query local hour in IST [0..23]. */
  localHourIST?: number;
}

/** All stops in the transit network, flattened for nearest-neighbor queries. */
export interface TransitStop {
  nodeId: NodeId;
  name: string;
  lat: number;
  lng: number;
  type: 'metro_station' | 'bus_stop';
  line: LineId;
}
