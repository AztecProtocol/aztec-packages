import { assertValidSlotDurations, validateSlotDurations } from './config.js';

describe('validateSlotDurations', () => {
  it('returns no errors for a sound config', () => {
    expect(validateSlotDurations({ ethereumSlotDuration: 12, aztecSlotDuration: 36 })).toEqual([]);
  });

  it('errors when aztecSlotDuration is not a multiple of ethereumSlotDuration', () => {
    expect(validateSlotDurations({ ethereumSlotDuration: 8, aztecSlotDuration: 36 })).toContainEqual(
      expect.stringContaining('must be a multiple'),
    );
  });

  it('errors when ethereumSlotDuration is non-positive', () => {
    expect(validateSlotDurations({ ethereumSlotDuration: 0, aztecSlotDuration: 36 })).toContainEqual(
      expect.stringContaining('ethereumSlotDuration must be positive'),
    );
  });

  it('errors when aztecSlotDuration is non-positive', () => {
    expect(validateSlotDurations({ ethereumSlotDuration: 12, aztecSlotDuration: 0 })).toContainEqual(
      expect.stringContaining('aztecSlotDuration must be positive'),
    );
  });
});

describe('assertValidSlotDurations', () => {
  it('does not throw for a sound config', () => {
    expect(() => assertValidSlotDurations({ ethereumSlotDuration: 12, aztecSlotDuration: 36 })).not.toThrow();
  });

  it('throws when aztecSlotDuration is not a multiple of ethereumSlotDuration', () => {
    expect(() => assertValidSlotDurations({ ethereumSlotDuration: 8, aztecSlotDuration: 36 })).toThrow(
      /must be a multiple/,
    );
  });
});
