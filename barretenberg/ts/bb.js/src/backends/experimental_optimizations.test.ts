import { assertExperimentalOptionsMatch, experimentalEnvironment } from './experimental_optimizations.js';

describe('experimentalEnvironment', () => {
  it('defaults to disabled without environment settings', () => {
    expect(experimentalEnvironment({})).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '0',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '0',
    });
  });

  it('reads the process environment when the option is omitted', () => {
    expect(experimentalEnvironment({}, { BB_EXPERIMENTAL_OPTIMIZATIONS: '1' })).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '1',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '0',
    });
  });

  it('lets an explicit false override the environment', () => {
    expect(
      experimentalEnvironment({ experimentalOptimizations: false }, { BB_EXPERIMENTAL_OPTIMIZATIONS: '1' }),
    ).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '0',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '0',
    });
  });

  it('allows either group to be selected independently', () => {
    expect(experimentalEnvironment({ experimentalOptimizations: false, avmExperimentalOptimizations: true })).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '0',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '1',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '0',
    });
  });

  it('rejects invalid environment values', () => {
    expect(() => experimentalEnvironment({}, { BB_EXPERIMENTAL_OPTIMIZATIONS: 'true' })).toThrow('must be 0 or 1');
  });
  it('rejects truthy strings supplied by untyped callers', () => {
    expect(() => {
      // @ts-expect-error The runtime must also validate untyped callers.
      experimentalEnvironment({ experimentalOptimizations: '0' });
    }).toThrow('must be a boolean');
  });
  it('rejects untyped AVM options', () => {
    expect(() => {
      // @ts-expect-error The runtime must also validate untyped callers.
      experimentalEnvironment({ avmExperimentalOptimizations: '0' });
    }).toThrow('must be a boolean');
  });
});

describe('rollup experimental options', () => {
  it('resolves independently and allows explicit false to override the environment', () => {
    expect(experimentalEnvironment({}, { ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '1' })).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '0',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '1',
    });
    expect(
      experimentalEnvironment(
        { rollupExperimentalOptimizations: false },
        {
          BB_EXPERIMENTAL_OPTIMIZATIONS: '1',
          AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
          ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '1',
        },
      ),
    ).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '1',
      AVM_EXPERIMENTAL_OPTIMIZATIONS: '0',
      ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: '0',
    });
  });
  it('validates rollup settings', () => {
    expect(() => experimentalEnvironment({}, { ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: 'true' })).toThrow('must be 0 or 1');
    // @ts-expect-error Untyped callers must also be validated.
    expect(() => experimentalEnvironment({ rollupExperimentalOptimizations: '1' })).toThrow('must be a boolean');
  });
  it('rejects changes to a configured singleton', () => {
    expect(() => assertExperimentalOptionsMatch({ rollupExperimentalOptimizations: true }, {})).toThrow(
      'already configured',
    );
    expect(() => assertExperimentalOptionsMatch({}, { rollupExperimentalOptimizations: true })).not.toThrow();
    expect(() =>
      assertExperimentalOptionsMatch(
        { rollupExperimentalOptimizations: false },
        { rollupExperimentalOptimizations: true },
      ),
    ).toThrow('already configured');
  });
});
