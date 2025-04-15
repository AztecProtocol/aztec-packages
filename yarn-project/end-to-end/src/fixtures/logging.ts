import { mkdirpSync } from 'fs-extra';
import { dirname } from 'path';

let metricsLoggerSet = false;

/** Returns whether metrics logging should be enabled by default, checking env vars CI and BENCHMARK. */
export function isMetricsLoggingRequested() {
  return !!(process.env.CI || process.env.BENCHMARK);
}

/**
 * Configures an NDJSON logger to output entries to a local file that have an `eventName` associated.
 * Idempotent and automatically called by `setup` if CI or BENCHMARK env vars are set.
 */
export function setupMetricsLogger(filename: string) {
  if (metricsLoggerSet) {
    return;
  }
  mkdirpSync(dirname(filename));
  // TODO(palla/log): Reenable or kill metrics logger
  metricsLoggerSet = true;
}
