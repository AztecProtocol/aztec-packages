import { pino } from 'pino';

export const logger = pino({ name: 'bb.js', level: process.env.LOG_LEVEL, browser: { asObject: false } });

export function createChildLogger(name: string) {
  const sublogger = logger.child({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}
