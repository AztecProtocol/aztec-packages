import { type ComponentLogger, type Logger } from '@libp2p/interface';

import { getLogLevelFromFilters } from './log-filters.js';
import { logFilters, logger } from './pino-logger.js';

/**
 * Creates a libp2p compatible logger that wraps our pino logger.
 * This adapter implements the ComponentLogger interface required by libp2p.
 */
export function createLibp2pComponentLogger(namespace: string): ComponentLogger {
  return {
    forComponent: (component: string) => createLibp2pLogger(`${namespace}:${component}`),
  };
}

function createLibp2pLogger(component: string): Logger {
  // Create a direct pino logger instance for libp2p that supports string interpolation
  const log = logger.child({ module: component }, { level: getLogLevelFromFilters(logFilters, component) });

  // Default log level is trace as this is super super noisy
  const logFn = (message: string, ...args: unknown[]) => {
    log.trace(message, ...args);
  };

  return Object.assign(logFn, {
    enabled: log.isLevelEnabled('debug'),

    error(message: string, ...args: unknown[]) {
      log.error(message, ...args);
    },

    debug(message: string, ...args: unknown[]) {
      log.debug(message, ...args);
    },

    info(message: string, ...args: unknown[]) {
      log.info(message, ...args);
    },

    warn(message: string, ...args: unknown[]) {
      log.warn(message, ...args);
    },

    trace(message: string, ...args: unknown[]) {
      log.trace(message, ...args);
    },
  });
}
