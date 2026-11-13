import { experimentalEnvironment } from './experimental_optimizations.js';

describe('experimentalEnvironment', () => {
  it('defaults to disabled without environment settings', () => {
    expect(experimentalEnvironment({})).toEqual({ BB_EXPERIMENTAL_OPTIMIZATIONS: '0' });
  });

  it('reads the process environment when the option is omitted', () => {
    expect(experimentalEnvironment({}, { BB_EXPERIMENTAL_OPTIMIZATIONS: '1' })).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '1',
    });
  });

  it('lets an explicit false override the environment', () => {
    expect(
      experimentalEnvironment({ experimentalOptimizations: false }, { BB_EXPERIMENTAL_OPTIMIZATIONS: '1' }),
    ).toEqual({
      BB_EXPERIMENTAL_OPTIMIZATIONS: '0',
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
});
