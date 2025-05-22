import { Logger, pino } from 'pino';
import { LogLevels, LogOptions } from '../types.js';

const defaultOptions = {
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
};

const defaultLevel = (process.env.LOG_LEVEL || 'info') as LogLevels;

// Options must be exposed so they can be provided to threads upon creation
// This way we ensure all loggers are spawned with the same options
export let logOptions: LogOptions | undefined;

let logger: Logger<'verbose'> | undefined;

export function initLogger(
  { level = defaultLevel, useStdErr = false }: LogOptions = { level: defaultLevel, useStdErr: false },
) {
  if (logger) {
    return logger;
  }
  logOptions = { level, useStdErr };
  const transport = pino.transport({
    target: 'pino/file',
    options: { destination: useStdErr ? 2 : 1 },
  });
  logger = pino({ ...defaultOptions, level }, transport);
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
