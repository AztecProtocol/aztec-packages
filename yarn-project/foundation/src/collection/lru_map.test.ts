import { LruMap } from './lru_map.js';

describe('LruMap', () => {
  it('stores and retrieves values', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBeUndefined();
  });

  it('reports correct size', () => {
    const map = new LruMap<number, string>(5);
    expect(map.size).toBe(0);
    map.set(1, 'a');
    expect(map.size).toBe(1);
    map.set(2, 'b');
    map.set(3, 'c');
    expect(map.size).toBe(3);
  });

  it('overwrites the value of an existing key without growing', () => {
    const map = new LruMap<string, number>(5);
    map.set('a', 1);
    map.set('a', 2);
    expect(map.get('a')).toBe(2);
    expect(map.size).toBe(1);
  });

  it('does not grow beyond maxSize', () => {
    const map = new LruMap<number, number>(3);
    map.set(1, 1);
    map.set(2, 2);
    map.set(3, 3);
    map.set(4, 4);
    expect(map.size).toBe(3);
    expect(map.get(1)).toBeUndefined(); // evicted (least recent)
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBe(3);
    expect(map.get(4)).toBe(4);
  });

  it('evicts least recently used, not least recently added', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);

    // Access 'a' via get(), making it the most recently used
    expect(map.get('a')).toBe(1);

    // Now 'b' is the least recently used. Adding 'd' should evict 'b'.
    map.set('d', 4);
    expect(map.get('b')).toBeUndefined(); // evicted
    expect(map.get('a')).toBe(1); // kept (was refreshed)
    expect(map.get('c')).toBe(3);
    expect(map.get('d')).toBe(4);
  });

  it('refreshes recency on set() of existing key', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);

    // Re-set 'a', refreshing its recency
    map.set('a', 10);

    // 'b' is now least recent. Adding 'd' should evict 'b'.
    map.set('d', 4);
    expect(map.get('b')).toBeUndefined(); // evicted
    expect(map.get('a')).toBe(10);
    expect(map.size).toBe(3);
  });

  it('has() does not refresh recency', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);

    // has('a') must not refresh recency, so 'a' stays the LRU entry
    expect(map.has('a')).toBe(true);
    map.set('c', 3);
    expect(map.has('a')).toBe(false); // evicted
    expect(map.has('b')).toBe(true);
    expect(map.has('c')).toBe(true);
  });

  it('deletes entries', () => {
    const map = new LruMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.delete('a')).toBe(true);
    expect(map.delete('a')).toBe(false);
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(1);
  });

  it('reuses freed capacity after delete', () => {
    const map = new LruMap<number, number>(2);
    map.set(1, 1);
    map.set(2, 2);
    map.delete(1);
    map.set(3, 3);
    expect(map.size).toBe(2);
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBe(3);
  });

  it('clears all entries', () => {
    const map = new LruMap<number, number>(5);
    map.set(1, 1);
    map.set(2, 2);
    map.set(3, 3);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.get(1)).toBeUndefined();
  });

  it('works correctly after clear and re-add', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.clear();
    map.set('c', 3);
    map.set('d', 4);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBeUndefined();
    expect(map.get('c')).toBe(3);
    expect(map.get('d')).toBe(4);
  });

  it('works with maxSize of 1', () => {
    const map = new LruMap<number, number>(1);
    map.set(1, 1);
    expect(map.get(1)).toBe(1);
    map.set(2, 2);
    expect(map.get(1)).toBeUndefined();
    expect(map.get(2)).toBe(2);
    expect(map.size).toBe(1);
  });

  it('throws on invalid maxSize', () => {
    expect(() => new LruMap<number, number>(0)).toThrow('LruMap maxSize must be at least 1');
    expect(() => new LruMap<number, number>(-1)).toThrow('LruMap maxSize must be at least 1');
  });

  it('handles sequential evictions correctly', () => {
    const map = new LruMap<number, number>(3);
    // Fill to capacity
    for (let i = 0; i < 3; i++) {
      map.set(i, i);
    }
    // Evict each one in FIFO order (no access refreshes)
    for (let i = 3; i < 10; i++) {
      map.set(i, i);
      expect(map.size).toBe(3);
      expect(map.get(i - 3)).toBeUndefined(); // oldest was evicted
    }
  });
});
