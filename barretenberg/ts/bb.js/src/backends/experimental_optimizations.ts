import type { BackendOptions } from './index.js';

/** Resolve startup settings before creating the native process or WASM module. */
export function experimentalEnvironment(
  options: Pick<
    BackendOptions,
    'experimentalOptimizations' | 'rollupExperimentalOptimizations' | 'avmExperimentalOptimizations'
  >,
  environment: Record<string, string | undefined> = {},
): Record<string, string> {
  const resolve = (name: string, explicit: boolean | undefined): string => {
    if (explicit !== undefined && typeof explicit !== 'boolean') {
      throw new Error(`${name} initialization option must be a boolean`);
    }
    const value = explicit === undefined ? (environment[name] ?? '0') : explicit ? '1' : '0';
    if (value !== '0' && value !== '1') {
      throw new Error(`${name} must be 0 or 1`);
    }
    return value;
  };
  return {
    BB_EXPERIMENTAL_OPTIMIZATIONS: resolve('BB_EXPERIMENTAL_OPTIMIZATIONS', options.experimentalOptimizations),
    AVM_EXPERIMENTAL_OPTIMIZATIONS: resolve('AVM_EXPERIMENTAL_OPTIMIZATIONS', options.avmExperimentalOptimizations),
    ROLLUP_EXPERIMENTAL_OPTIMIZATIONS: resolve(
      'ROLLUP_EXPERIMENTAL_OPTIMIZATIONS',
      options.rollupExperimentalOptimizations,
    ),
  };
}

/** Reject changing a frozen singleton's experimental setting. */
export function assertExperimentalOptionsMatch(requested: BackendOptions, configured: BackendOptions): void {
  if (
    requested.experimentalOptimizations !== undefined &&
    requested.experimentalOptimizations !== (configured.experimentalOptimizations ?? false)
  ) {
    throw new Error('BB experimental optimizations are already configured; create a new backend to change them');
  }
  if (
    requested.rollupExperimentalOptimizations !== undefined &&
    requested.rollupExperimentalOptimizations !== (configured.rollupExperimentalOptimizations ?? false)
  ) {
    throw new Error('Rollup experimental optimizations are already configured; create a new backend to change them');
  }
  if (
    requested.avmExperimentalOptimizations !== undefined &&
    requested.avmExperimentalOptimizations !== (configured.avmExperimentalOptimizations ?? false)
  ) {
    throw new Error('AVM experimental optimizations are already configured; create a new backend to change them');
  }
}
