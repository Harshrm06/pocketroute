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
 * Invariant (PRD Lemma 4):
 * Sorted by cost ascending, labels satisfy:
 *   c_0 < c_1 < c_2 < ...
 *   t_0 > t_1 > t_2 > ...
 * Costs are integers in [0, B], so the frontier contains at most B + 1 entries.
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
   * Tests whether the candidate point (t, c) is dominated by any label in this frontier.
   * Label p dominates (t, c) iff p.t <= t and p.c <= c.
   */
  dominated(t: number, c: number): boolean {
    if (this.labels.length === 0) return false;

    // Binary search for the label with the largest cost <= c
    let low = 0;
    let high = this.labels.length - 1;
    let bestIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.labels[mid]!.c <= c) {
        bestIdx = mid;
        low = mid + 1; // Try to find a larger cost <= c
      } else {
        high = mid - 1;
      }
    }

    if (bestIdx === -1) {
      // All existing labels have cost > c, so none has cost <= c
      return false;
    }

    // Because times are strictly decreasing with cost, labels[bestIdx] has
    // the minimum arrival time among all labels with cost <= c.
    return this.labels[bestIdx]!.t <= t;
  }

  /**
   * Marks and removes all existing labels that are dominated by (t, c).
   * Existing label q is dominated iff t <= q.t and c <= q.c.
   *
   * @returns Array of removed labels (each marked with removed = true).
   */
  removeDominatedBy(t: number, c: number): Label[] {
    if (this.labels.length === 0) return [];

    const kept: Label[] = [];
    const removed: Label[] = [];

    for (const q of this.labels) {
      // q is dominated by (t, c) if c <= q.c and t <= q.t
      if (c <= q.c && t <= q.t) {
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
   * Maintains cost-ascending and time-descending invariant.
   *
   * @param label The candidate label to insert.
   * @returns true if label was accepted, false if dominated.
   */
  add(label: Label): boolean {
    if (this.dominated(label.t, label.c)) {
      return false;
    }

    this.removeDominatedBy(label.t, label.c);

    // Find insertion index to maintain cost ascending
    let insertIdx = 0;
    while (
      insertIdx < this.labels.length &&
      this.labels[insertIdx]!.c < label.c
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
   * c_0 < c_1 < ... and t_0 > t_1 > ...
   */
  assertInvariant(): void {
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
