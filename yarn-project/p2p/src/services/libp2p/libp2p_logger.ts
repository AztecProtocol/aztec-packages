import { createLogger } from '@aztec/foundation/log';

import { type ComponentLogger, type Logger } from '@libp2p/interface';

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
  const logger = createLogger(component);

  // Default log level is trace as this is super super noisy
  const logFn = (formatter: any, ...args: any[]) => {
    // Handle %p format specifier by manually replacing with args
    if (typeof formatter === 'string' && args.length > 0) {
      // Handle %p, %a and %s format specifiers
      const parts = formatter.split(/(%p|%a|%s)/);
      let result = parts[0];
      let argIndex = 0;

      for (let i = 1; i < parts.length; i += 2) {
        if (argIndex < args.length) {
          result += String(args[argIndex]) + (parts[i + 1] || '');
          argIndex++;
        }
      }

      formatter = result;
      args = args.slice(argIndex);
    }

    // Handle object args by spreading them
    if (args.length === 1 && typeof args[0] === 'object') {
      logger.trace(formatter, args[0]);
    } else {
      logger.trace(formatter, ...args);
    }
  };

  return Object.assign(logFn, {
    enabled: logger.isLevelEnabled('debug'),

    error(...args: any[]) {
      const [msg, ...rest] = args;
      logger.error(msg as string, ...rest);
    },

    debug(...args: any[]) {
      const [msg, ...rest] = args;
      logger.debug(msg as string, ...rest);
    },

    info(...args: any[]) {
      const [msg, ...rest] = args;
      logger.info(msg as string, ...rest);
    },

    warn(...args: any[]) {
      const [msg, ...rest] = args;
      logger.warn(msg as string, ...rest);
    },

    trace(...args: any[]) {
      const [msg, ...rest] = args;
      logger.trace(msg as string, ...rest);
    },
  });
}
