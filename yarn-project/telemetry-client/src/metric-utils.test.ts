import { COINBASE, OK, STATUS } from './attributes.js';
import { expandAttributeCombinations } from './metric-utils.js';

describe('expandAttributeCombinations', () => {
  it('returns single empty object for empty input', () => {
    expect(expandAttributeCombinations({})).toEqual([{}]);
  });

  it('expands single attribute with single value', () => {
    const result = expandAttributeCombinations({
      [OK]: [true],
    });
    expect(result).toEqual([{ [OK]: true }]);
  });

  it('expands single attribute with multiple values', () => {
    const result = expandAttributeCombinations({
      [OK]: [true, false],
    });
    expect(result).toEqual([{ [OK]: true }, { [OK]: false }]);
  });

  it('expands two attributes into cartesian product', () => {
    const result = expandAttributeCombinations({
      [OK]: [true, false],
      [STATUS]: ['success', 'failure'],
    });
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ [OK]: true, [STATUS]: 'success' });
    expect(result).toContainEqual({ [OK]: true, [STATUS]: 'failure' });
    expect(result).toContainEqual({ [OK]: false, [STATUS]: 'success' });
    expect(result).toContainEqual({ [OK]: false, [STATUS]: 'failure' });
  });

  it('handles three attributes', () => {
    const result = expandAttributeCombinations({
      [OK]: [true, false],
      [STATUS]: ['a', 'b'],
      [COINBASE]: [1, 2, 3],
    });
    expect(result).toHaveLength(12);
  });

  it('handles numeric values', () => {
    const result = expandAttributeCombinations({
      [STATUS]: [1, 2, 3],
    });
    expect(result).toEqual([{ [STATUS]: 1 }, { [STATUS]: 2 }, { [STATUS]: 3 }]);
  });
});
