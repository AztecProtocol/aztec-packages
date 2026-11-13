import type { BackendOptions } from './index.js';

/** Resolve startup settings before creating the native process or WASM module. */
export function experimentalEnvironment(
  options: Pick<BackendOptions, 'experimentalOptimizations'>,
  environment: Record<string, string | undefined> = {},
): Record<string, string> {
  const explicit = options.experimentalOptimizations;
  if (explicit !== undefined && typeof explicit !== 'boolean') {
    throw new Error('BB_EXPERIMENTAL_OPTIMIZATIONS initialization option must be a boolean');
  }
  const value = explicit === undefined ? (environment.BB_EXPERIMENTAL_OPTIMIZATIONS ?? '0') : explicit ? '1' : '0';
  if (value !== '0' && value !== '1') {
    throw new Error('BB_EXPERIMENTAL_OPTIMIZATIONS must be 0 or 1');
  }
  return { BB_EXPERIMENTAL_OPTIMIZATIONS: value };
}

/** Reject changing a frozen singleton's experimental setting. */
export function assertExperimentalOptionsMatch(requested: BackendOptions, configured: BackendOptions): void {
  if (
    requested.experimentalOptimizations !== undefined &&
    requested.experimentalOptimizations !== (configured.experimentalOptimizations ?? false)
  ) {
    throw new Error('BB experimental optimizations are already configured; create a new backend to change them');
  }
}
