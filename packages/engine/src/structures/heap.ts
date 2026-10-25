/**
 * Generic binary min-heap implementation.
 * Used for priority queues in Dijkstra and RCSPP.
 */

export type Comparator<T> = (a: T, b: T) => number;

/**
 * Binary min-heap backed by an array.
 * Elements are ordered using the provided comparator function:
 * comparator(a, b) < 0 means 'a' has higher priority than 'b' (popped first).
 */
export class BinaryHeap<T> {
  private items: T[] = [];
  private comparator: Comparator<T>;

  constructor(comparator: Comparator<T>) {
    this.comparator = comparator;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  clear(): void {
    this.items = [];
  }

  toArray(): T[] {
    return [...this.items];
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.comparator(this.items[idx]!, this.items[parentIdx]!) < 0) {
        const temp = this.items[idx]!;
        this.items[idx] = this.items[parentIdx]!;
        this.items[parentIdx] = temp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    const length = this.items.length;
    let idx = index;

    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;

      if (
        left < length &&
        this.comparator(this.items[left]!, this.items[smallest]!) < 0
      ) {
        smallest = left;
      }

      if (
        right < length &&
        this.comparator(this.items[right]!, this.items[smallest]!) < 0
      ) {
        smallest = right;
      }

      if (smallest !== idx) {
        const temp = this.items[idx]!;
        this.items[idx] = this.items[smallest]!;
        this.items[smallest] = temp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

/** MinHeap alias for BinaryHeap */
export const MinHeap = BinaryHeap;
