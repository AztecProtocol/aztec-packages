import type { ComponentLogger, Logger } from '@libp2p/interface';

import { getLogLevelFromFilters } from './log-filters.js';
import type { LogLevel } from './log-levels.js';
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

// Lipp2p libraries use arbitrary string substitutions, so we need to replace them with %s, this is slow so avoid doing it unless trace debugging
function replaceFormatting(message: string) {
  // Message can sometimes not be a string, e.g. an error object, just return it as is
  if (!message?.replace) {
    return message;
  }

  return message.replace(/(%p|%a)/g, '%s');
}

function createLibp2pLogger(component: string): Logger {
  // Create a direct pino logger instance for libp2p that supports string interpolation
  const log = logger.child({ module: component }, { level: getLogLevelFromFilters(logFilters, component) });

  const logIfEnabled = (level: LogLevel, message: string, ...args: unknown[]) => {
    if (!log.isLevelEnabled(level)) {
      return;
    }

    log[level](replaceFormatting(message), ...formatArgs(message, args));
  };

  // Default log level is trace as this is super super noisy
  const logFn = (message: string, ...args: unknown[]) => {
    logIfEnabled('trace', message, ...args);
  };

  return Object.assign(logFn, {
    enabled: log.isLevelEnabled('debug'),
    error(message: string, ...args: unknown[]) {
      // We write error outputs as debug as they are often expected, e.g. connection errors can happen in happy paths
      logIfEnabled('debug', `error: ${message}`, ...args);
    },

    debug(message: string, ...args: unknown[]) {
      logIfEnabled('debug', message, ...args);
    },

    info(message: string, ...args: unknown[]) {
      logIfEnabled('info', message, ...args);
    },

    warn(message: string, ...args: unknown[]) {
      logIfEnabled('warn', message, ...args);
    },

    trace(message: string, ...args: unknown[]) {
      logIfEnabled('trace', message, ...args);
    },
  });
}

function formatArgs(message: string, args: unknown[]) {
  if (!args) {
    return args;
  }
  return args.map(arg => {
    if (
      typeof arg === 'object' &&
      arg &&
      'err' in arg &&
      arg.err instanceof Error &&
      'type' in arg.err &&
      arg.err.type === 'AbortError'
    ) {
      delete arg.err; // Remove the AbortError from the logs
    }
    return arg;
  });
}
