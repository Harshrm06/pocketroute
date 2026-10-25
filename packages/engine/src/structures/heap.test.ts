import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BinaryHeap } from './heap.js';

describe('BinaryHeap', () => {
  it('correctly handles basic operations (push, peek, pop, size, isEmpty)', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    expect(heap.isEmpty()).toBe(true);
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();

    heap.push(5);
    expect(heap.isEmpty()).toBe(false);
    expect(heap.size).toBe(1);
    expect(heap.peek()).toBe(5);

    heap.push(2);
    heap.push(8);
    heap.push(1);

    expect(heap.size).toBe(4);
    expect(heap.peek()).toBe(1);

    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(2);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(8);
    expect(heap.pop()).toBeUndefined();
    expect(heap.isEmpty()).toBe(true);
  });

  it('handles objects with composite lexicographic keys', () => {
    interface Item {
      cost: number;
      time: number;
      label: string;
    }

    // Lexicographic comparator: primary cost, tie-break time
    const heap = new BinaryHeap<Item>((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.time - b.time;
    });

    heap.push({ cost: 20, time: 10, label: 'B' });
    heap.push({ cost: 10, time: 30, label: 'A1' });
    heap.push({ cost: 10, time: 15, label: 'A2' });
    heap.push({ cost: 50, time: 5, label: 'C' });

    expect(heap.pop()?.label).toBe('A2'); // cost 10, time 15
    expect(heap.pop()?.label).toBe('A1'); // cost 10, time 30
    expect(heap.pop()?.label).toBe('B'); // cost 20, time 10
    expect(heap.pop()?.label).toBe('C'); // cost 50, time 5
  });

  it('clears all items', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    heap.push(1);
    heap.push(2);
    expect(heap.size).toBe(2);
    heap.clear();
    expect(heap.size).toBe(0);
    expect(heap.isEmpty()).toBe(true);
    expect(heap.pop()).toBeUndefined();
  });

  it('heapsort property: always pops in ascending order for any sequence (fast-check)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -10000, max: 10000 })), (arr) => {
        const heap = new BinaryHeap<number>((a, b) => a - b);
        for (const num of arr) {
          heap.push(num);
        }

        const popped: number[] = [];
        while (!heap.isEmpty()) {
          popped.push(heap.pop()!);
        }

        const expected = [...arr].sort((a, b) => a - b);
        expect(popped).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
