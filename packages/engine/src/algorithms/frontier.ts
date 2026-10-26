/**
 * Pareto frontier for multi-criteria label-setting (RCSPP).
 * PRD Section 8.3 & Section 8.5 (Lemma 4).
 */
import type { Edge, StateId } from '../graph/index.js';

/**
 * A label representing a path reaching a state in the state graph.
 * Records arrival time t, accumulated fare c, and backpointers.
 */
export interface Label {
  /** Arrival time in minutes since midnight IST. */
  t: number;
  /** Accumulated fare in INR (integer >= 0). */
  c: number;
  /** Current state (nodeId|lineId). */
  state: StateId;
  /** Number of bus-to-bus transfers (0 to 2, PRD §23). */
  busTransfers?: number;
  /** Backpointer to parent label. */
  parent?: Label;
  /** Edge traversed to reach this state. */
  edge?: Edge;
  /** Set to true when this label is removed from the frontier by dominance. */
  removed: boolean;
}

/**
 * Non-dominated Pareto frontier for a single state.
 *
 * Invariant (PRD Lemma 4 extended to transfers in v1.2.0):
 * Label p dominates q iff same node, same currentLineId, and:
 *   p.time <= q.time && p.cost <= q.cost && p.busTransfers <= q.busTransfers
 */
export class ParetoFrontier {
  private labels: Label[] = [];

  get size(): number {
    return this.labels.length;
  }

  isEmpty(): boolean {
    return this.labels.length === 0;
  }

  toArray(): Label[] {
    return [...this.labels];
  }

  /**
   * Tests whether the candidate point (t, c, busTransfers) is dominated by any label in this frontier.
   * Label p dominates (t, c, busTransfers) iff p.t <= t and p.c <= c and (p.busTransfers ?? 0) <= busTransfers.
   */
  dominated(t: number, c: number, busTransfers: number = 0): boolean {
    for (let i = 0; i < this.labels.length; i++) {
      const p = this.labels[i]!;
      const pTau = p.busTransfers ?? 0;
      if (p.t <= t && p.c <= c && pTau <= busTransfers) {
        return true;
      }
    }
    return false;
  }

  /**
   * Marks and removes all existing labels that are dominated by (t, c, busTransfers).
   * Existing label q is dominated iff t <= q.t and c <= q.c and busTransfers <= (q.busTransfers ?? 0).
   *
   * @returns Array of removed labels (each marked with removed = true).
   */
  removeDominatedBy(t: number, c: number, busTransfers: number = 0): Label[] {
    if (this.labels.length === 0) return [];

    const kept: Label[] = [];
    const removed: Label[] = [];

    for (const q of this.labels) {
      const qTau = q.busTransfers ?? 0;
      if (t <= q.t && c <= q.c && busTransfers <= qTau) {
        q.removed = true;
        removed.push(q);
      } else {
        kept.push(q);
      }
    }

    this.labels = kept;
    return removed;
  }

  /**
   * Inserts a label into the frontier if not dominated.
   * Removes any existing labels dominated by the new label.
   *
   * @param label The candidate label to insert.
   * @returns true if label was accepted, false if dominated.
   */
  add(label: Label): boolean {
    const tau = label.busTransfers ?? 0;
    if (this.dominated(label.t, label.c, tau)) {
      return false;
    }

    this.removeDominatedBy(label.t, label.c, tau);

    // Find insertion index to maintain cost ascending, then time ascending, then tau ascending
    let insertIdx = 0;
    while (
      insertIdx < this.labels.length &&
      (this.labels[insertIdx]!.c < label.c ||
        (this.labels[insertIdx]!.c === label.c &&
          (this.labels[insertIdx]!.t < label.t ||
            (this.labels[insertIdx]!.t === label.t &&
              (this.labels[insertIdx]!.busTransfers ?? 0) <= tau))))
    ) {
      insertIdx++;
    }

    this.labels.splice(insertIdx, 0, label);

    // Invariant check in debug mode
    this.assertInvariant();

    return true;
  }

  /**
   * Asserts the Pareto frontier invariant:
   * 1. No label in the frontier dominates another label.
   * 2. If all labels have equal transfers, costs are strictly ascending and times strictly descending.
   */
  assertInvariant(): void {
    for (let i = 0; i < this.labels.length; i++) {
      const cur = this.labels[i]!;
      const curTau = cur.busTransfers ?? 0;
      for (let j = 0; j < this.labels.length; j++) {
        if (i === j) continue;
        const other = this.labels[j]!;
        const otherTau = other.busTransfers ?? 0;
        if (cur.t <= other.t && cur.c <= other.c && curTau <= otherTau) {
          throw new Error(
            `Pareto frontier invariant violated: label ${i} (${cur.t}, ${cur.c}, ${curTau}) dominates label ${j} (${other.t}, ${other.c}, ${otherTau})`,
          );
        }
      }
    }

    const allSameTransfers = this.labels.every(
      (l) => (l.busTransfers ?? 0) === (this.labels[0]?.busTransfers ?? 0),
    );
    if (allSameTransfers && this.labels.length > 1) {
      for (let i = 0; i < this.labels.length - 1; i++) {
        const cur = this.labels[i]!;
        const next = this.labels[i + 1]!;
        if (cur.c >= next.c || cur.t <= next.t) {
          throw new Error(
            `Pareto frontier invariant violated at index ${i}: ` +
              `(${cur.t}, ${cur.c}) vs (${next.t}, ${next.c})`,
          );
        }
      }
    }
  }
}
