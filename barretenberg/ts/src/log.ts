import { pino } from 'pino';

export const logger = pino({
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
  level: process ? process.env.LOG_LEVEL : 'info',
  browser: { asObject: false },
});

export function createDebugLogger(name: string) {
  const sublogger = logger.child({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}
