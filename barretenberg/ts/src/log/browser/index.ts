import { pino } from 'pino';
import { LogOptions } from '../types.js';
import { Logger } from 'pino';

const defaultOptions = {
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
  browser: { asObject: false },
};

// Options must be exposed so they can be provided to threads upon creation
// This way we ensure all loggers are spawned with the same options
export let logOptions: LogOptions | undefined;

let logger: Logger<'verbose'> | undefined;

export function initLogger({ level = 'info' }: LogOptions = { level: 'info', useStdErr: false }) {
  if (logger) {
    return logger;
  }
  logOptions = { level, useStdErr: false };
  logger = pino({ ...defaultOptions, level });
}

export function createDebugLogger(name: string) {
  initLogger();

  const sublogger = logger!.child({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}
