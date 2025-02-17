import { createLogger } from '@aztec/foundation/log';

import { type ComponentLogger, type Logger } from '@libp2p/interface';

/**
 * Creates a libp2p compatible logger that wraps our pino logger.
 * This adapter implements the ComponentLogger interface required by libp2p.
 */
export function createLibp2pComponentLogger(namespace: string, fixedTerms = {}): ComponentLogger {
  return {
    forComponent: (component: string) => createLibp2pLogger(`${namespace}:${component}`, fixedTerms),
  };
}

function createLibp2pLogger(component: string): Logger {
  const logger = createLogger(component);

  // Default log level is trace as this is super super noisy
  const logFn = (message: string, ...args: unknown[]) => {
    logger.trace(message, ...args);
  };

  return Object.assign(logFn, {
    enabled: logger.isLevelEnabled('debug'),

    error(message: string, ...args: unknown[]) {
      logger.error(message, ...args);
    },

    debug(message: string, ...args: unknown[]) {
      logger.debug(message, ...args);
    },

    info(message: string, ...args: unknown[]) {
      logger.info(message, ...args);
    },

    warn(message: string, ...args: unknown[]) {
      logger.warn(message, ...args);
    },

    trace(message: string, ...args: unknown[]) {
      logger.trace(message, ...args);
    },
  });
}
