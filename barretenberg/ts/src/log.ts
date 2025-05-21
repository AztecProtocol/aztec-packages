import { pino } from 'pino';

export const logger = pino({
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
  level: process.env.LOG_LEVEL ?? 'info',
  browser: { asObject: false },
});

export function createChildLogger(name: string) {
  const sublogger = logger.child({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}
