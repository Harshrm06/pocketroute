/**
 * Reverses a StateGraph for backward Dijkstra (admissible lower-bound computations).
 * PRD §8.3:
 *   LB_t = BACKWARD_DIJKSTRA(G, D, weight=min_time)
 *   LB_c = BACKWARD_DIJKSTRA(G, D, weight=min_fare)
 */
import type { Edge, GraphNode, NodeId, StateGraph, StateId } from './types.js';
import { decodeState } from './types.js';

/**
 * Reverses all edges in a StateGraph.
 *
 * Each edge (u -> v, line, fare, minTimeMin) is inverted to (v -> u, line, fare, minTimeMin).
 * The resulting graph enables backward Dijkstra searches from destination D
 * to compute admissible lower bounds LB_t(v) and LB_c(v) per PRD §8.3.
 *
 * @param graph The forward StateGraph.
 * @returns A reversed StateGraph with inverted edges.
 */
export function reverseGraph(graph: StateGraph): StateGraph {
  const nodes = new Map<NodeId, GraphNode>(graph.nodes);
  const adj = new Map<StateId, Edge[]>();
  const nodeAdj = new Map<NodeId, Edge[]>();
  let edgeCount = 0;

  for (const [, edges] of graph.adj) {
    for (const e of edges) {
      const reversedEdge: Edge = {
        from: e.to,
        to: e.from,
        line: e.line,
        mode: e.mode,
        fareINR: e.fareINR,
        minTimeMin: e.minTimeMin,
        timeAt: (t: number) => t + e.minTimeMin,
        meta: e.meta,
      };

      // Add to state adjacency
      const stateList = adj.get(reversedEdge.from) ?? [];
      stateList.push(reversedEdge);
      adj.set(reversedEdge.from, stateList);

      // Add to node adjacency
      const fromNodeId = decodeState(reversedEdge.from).nodeId;
      const nodeList = nodeAdj.get(fromNodeId) ?? [];
      nodeList.push(reversedEdge);
      nodeAdj.set(fromNodeId, nodeList);

      edgeCount++;
    }
  }

  return {
    nodes,
    adj,
    nodeAdj,
    edgeCount,
    lineCount: graph.lineCount,
  };
}
