import { compact, mapValues, merge } from './object.js';

describe('mapValues', () => {
  it('should return a new object with mapped values', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const fn = (value: number) => value * 2;

    const result = mapValues(obj, fn);

    expect(result).toEqual({ a: 2, b: 4, c: 6 });
  });

  it('should handle an empty object', () => {
    const obj = {};
    const fn = (value: number) => value * 2;

    const result = mapValues(obj, fn);

    expect(result).toEqual({});
  });

  it('should handle different value types', () => {
    const obj = { a: 'hello', b: true, c: [1, 2, 3] };
    const fn = (value: any) => typeof value;

    const result = mapValues(obj, fn);

    expect(result).toEqual({ a: 'string', b: 'boolean', c: 'object' });
  });
});

describe('compact', () => {
  it('should remove keys with undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const result = compact(obj);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should not remove keys with falsey but not undefined values', () => {
    const obj = { a: false, b: 0, c: '', d: null, e: [] };
    const result = compact(obj);
    expect(result).toEqual(obj);
  });

  it('should handle an empty object', () => {
    const obj = {};
    const result = compact(obj);
    expect(result).toEqual({});
  });

  it('should handle an object with all undefined values', () => {
    const obj = { a: undefined, b: undefined, c: undefined };
    const result = compact(obj);
    expect(result).toEqual({});
  });

  it('should handle an object with no undefined values', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = compact(obj);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('merge', () => {
  it('should merge two objects with no conflicts', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3, d: 4 };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it('should override properties from first object with second object', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { b: 20, c: 30 };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 20, c: 30 });
  });

  it('should ignore undefined values in second object', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { b: undefined, c: 30, d: undefined };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 2, c: 30 });
  });

  it('should handle empty first object', () => {
    const obj1 = {};
    const obj2 = { a: 1, b: 2 };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should handle empty second object', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = {};
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should handle both objects being empty', () => {
    const obj1 = {};
    const obj2 = {};
    const result = merge(obj1, obj2);
    expect(result).toEqual({});
  });

  it('should handle second object with all undefined values', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: undefined, d: undefined };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should not mutate the original objects', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 20, c: 3 };
    const originalObj1 = { ...obj1 };
    const originalObj2 = { ...obj2 };

    const result = merge(obj1, obj2);

    expect(obj1).toEqual(originalObj1);
    expect(obj2).toEqual(originalObj2);
    expect(result).not.toBe(obj1);
    expect(result).not.toBe(obj2);
  });

  it('should handle different value types', () => {
    const obj1 = { a: 1, b: 'hello', c: [1, 2] };
    const obj2 = { b: true, d: { nested: 'value' } };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 1, b: true, c: [1, 2], d: { nested: 'value' } });
  });

  it('should preserve falsy but not undefined values', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { a: 0, b: false, c: '', d: null };
    const result = merge(obj1, obj2);
    expect(result).toEqual({ a: 0, b: false, c: '', d: null });
  });
});
