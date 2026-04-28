import { LruSet } from './lru_set.js';

describe('LruSet', () => {
  it('stores and retrieves items', () => {
    const set = new LruSet<string>(3);
    set.add('a');
    set.add('b');
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(false);
  });

  it('reports correct size', () => {
    const set = new LruSet<number>(5);
    expect(set.size).toBe(0);
    set.add(1);
    expect(set.size).toBe(1);
    set.add(2);
    set.add(3);
    expect(set.size).toBe(3);
  });

  it('does not grow beyond maxSize', () => {
    const set = new LruSet<number>(3);
    set.add(1);
    set.add(2);
    set.add(3);
    set.add(4);
    expect(set.size).toBe(3);
    expect(set.has(1)).toBe(false); // evicted (least recent)
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(true);
    expect(set.has(4)).toBe(true);
  });

  it('evicts least recently used, not least recently added', () => {
    const set = new LruSet<string>(3);
    set.add('a');
    set.add('b');
    set.add('c');

    // Access 'a' via has(), making it the most recently used
    expect(set.has('a')).toBe(true);

    // Now 'b' is the least recently used. Adding 'd' should evict 'b'.
    set.add('d');
    expect(set.has('b')).toBe(false); // evicted
    expect(set.has('a')).toBe(true); // kept (was refreshed)
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });

  it('refreshes recency on add() of existing item', () => {
    const set = new LruSet<string>(3);
    set.add('a');
    set.add('b');
    set.add('c');

    // Re-add 'a', refreshing its recency
    set.add('a');

    // 'b' is now least recent. Adding 'd' should evict 'b'.
    set.add('d');
    expect(set.has('b')).toBe(false); // evicted
    expect(set.has('a')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('does not duplicate on add() of existing item', () => {
    const set = new LruSet<number>(5);
    set.add(1);
    set.add(2);
    set.add(1);
    set.add(1);
    expect(set.size).toBe(2);
  });

  it('clears all entries', () => {
    const set = new LruSet<number>(5);
    set.add(1);
    set.add(2);
    set.add(3);
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);
    expect(set.has(3)).toBe(false);
  });

  it('works correctly after clear and re-add', () => {
    const set = new LruSet<string>(2);
    set.add('a');
    set.add('b');
    set.clear();
    set.add('c');
    set.add('d');
    expect(set.size).toBe(2);
    expect(set.has('a')).toBe(false);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });

  it('works with maxSize of 1', () => {
    const set = new LruSet<number>(1);
    set.add(1);
    expect(set.has(1)).toBe(true);
    set.add(2);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('throws on invalid maxSize', () => {
    expect(() => new LruSet<number>(0)).toThrow('LruSet maxSize must be at least 1');
    expect(() => new LruSet<number>(-1)).toThrow('LruSet maxSize must be at least 1');
  });

  it('handles sequential evictions correctly', () => {
    const set = new LruSet<number>(3);
    // Fill to capacity
    for (let i = 0; i < 3; i++) {
      set.add(i);
    }
    // Evict each one in FIFO order (no access refreshes)
    for (let i = 3; i < 10; i++) {
      set.add(i);
      expect(set.size).toBe(3);
      expect(set.has(i - 3)).toBe(false); // oldest was evicted
    }
  });
});
