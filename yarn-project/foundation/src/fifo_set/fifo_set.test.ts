import { FifoSet } from './fifo_set.js';

describe('FifoSet', () => {
  it('keeps entries up to the limit', () => {
    const set = FifoSet.withLimit<string>(3);

    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set]).toEqual(['a', 'b', 'c']);
    expect(set.size).toBe(3);
    expect(set.limit).toBe(3);
  });

  it('evicts the oldest entry when adding past the limit', () => {
    const set = FifoSet.withLimit<string>(2);

    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set]).toEqual(['b', 'c']);
  });

  it('compacts initial values to the newest entries', () => {
    const set = FifoSet.withLimit(2, ['a', 'b', 'c']);

    expect([...set]).toEqual(['b', 'c']);
  });

  it('does not evict when adding a duplicate', () => {
    const set = FifoSet.withLimit(2, ['a', 'b']);

    set.add('a');

    expect([...set]).toEqual(['a', 'b']);
  });

  it('adds absent values and reports whether the set changed', () => {
    const set = FifoSet.withLimit(2, ['a']);

    expect(set.addIfAbsent('a')).toBe(false);
    expect(set.addIfAbsent('b')).toBe(true);
    expect(set.addIfAbsent('c')).toBe(true);
    expect([...set]).toEqual(['b', 'c']);
  });

  it('can evict undefined values', () => {
    const set = FifoSet.withLimit<string | undefined>(1, [undefined, 'a']);

    expect([...set]).toEqual(['a']);

    set.add(undefined);

    expect([...set]).toEqual([undefined]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('throws for invalid limit %s', limit => {
    expect(() => FifoSet.withLimit(limit)).toThrow('FifoSet limit must be a positive safe integer');
  });
});
