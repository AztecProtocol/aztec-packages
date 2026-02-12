// Browser stub for @aztec/foundation/log
// Only used during vitest browser tests to avoid loading Barretenberg WASM.
// Create a logger that returns itself for chaining
function createLogger(name, bindings) {
  const prefix = name ? `[${name}]` : '';
  const logger = {
    fatal: (...args) => console.error('[FATAL]', prefix, ...args),
    error: (...args) => console.error('[ERROR]', prefix, ...args),
    warn: (...args) => console.warn('[WARN]', prefix, ...args),
    info: (...args) => console.info('[INFO]', prefix, ...args),
    debug: (...args) => console.debug('[DEBUG]', prefix, ...args),
    trace: (...args) => console.debug('[TRACE]', prefix, ...args),
    verbose: (...args) => console.log('[VERBOSE]', prefix, ...args),
    silent: () => {},
    child: () => createLogger(name, bindings),
    level: 'info',
  };
  return logger;
}

export { createLogger };
export const logLevel = 'info';
export const logFilters = [];

export default {
  createLogger,
  logLevel,
  logFilters,
};
