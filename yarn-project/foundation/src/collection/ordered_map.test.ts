import { OrderedMap } from './ordered_map.js';

describe('OrderedMap', () => {
  let orderedMap: OrderedMap<string, number>;

  beforeEach(() => {
    orderedMap = new OrderedMap<string, number>();
  });

  it('set should add new key-value pairs', () => {
    orderedMap.set('a', 1);
    expect(orderedMap.get('a')).toBe(1);
    expect(orderedMap.has('a')).toBe(true);
  });

  it('set should update existing keys and move them to the end', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('a', 3);
    expect(Array.from(orderedMap.values())).toEqual([2, 3]);
  });

  it('get should retrieve values for existing keys', () => {
    orderedMap.set('a', 1);
    expect(orderedMap.get('a')).toBe(1);
  });

  it('get should return undefined for non-existent keys', () => {
    expect(orderedMap.get('a')).toBeUndefined();
  });

  it('has should return true for existing keys', () => {
    orderedMap.set('a', 1);
    expect(orderedMap.has('a')).toBe(true);
  });

  it('has should return false for non-existent keys', () => {
    expect(orderedMap.has('a')).toBe(false);
  });

  it('delete should remove existing keys and return true', () => {
    orderedMap.set('a', 1);
    expect(orderedMap.delete('a')).toBe(true);
    expect(orderedMap.has('a')).toBe(false);
    expect(Array.from(orderedMap.values())).toEqual([]);
  });

  test('delete should return false for non-existent keys', () => {
    expect(orderedMap.delete('a')).toBe(false);
  });

  it('values should return an array of values in insertion order', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('c', 3);
    expect(Array.from(orderedMap.values())).toEqual([1, 2, 3]);
  });

  it('values should reflect the updated order after re-insertion', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('a', 3);
    expect(Array.from(orderedMap.values())).toEqual([2, 3]);
  });

  it('iterator should yield key-value pairs in insertion order', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('c', 3);
    expect(Array.from(orderedMap)).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('iterator should reflect the updated order after re-insertion', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('a', 3);
    expect(Array.from(orderedMap)).toEqual([['b', 2], ['a', 3]]);
  });

  it('multiple operations should maintain correct order and values', () => {
    orderedMap.set('a', 1);
    orderedMap.set('b', 2);
    orderedMap.set('c', 3);
    orderedMap.delete('b');
    orderedMap.set('d', 4);
    orderedMap.set('a', 5);
    expect(Array.from(orderedMap.values())).toEqual([3, 4, 5]);
    expect(Array.from(orderedMap)).toEqual([['c', 3], ['d', 4], ['a', 5]]);
  });
});