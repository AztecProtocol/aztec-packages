import { Logger } from 'pino';
import { initLogger } from './node/index.js';
import { LogOptions } from './types.js';

let logger: Logger<'verbose'> | undefined;

// Options must be exposed so they can be provided to threads upon creation
// This way we ensure all loggers are spawned with the same options
export let logOptions: LogOptions | undefined;

export function createDebugLogger(name: string) {
  if (!logger) {
    ({ logger, options: logOptions } = initLogger(logOptions));
  }

  const sublogger = logger.child({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}

export { initLogger } from './node/index.js';
