import { pino } from 'pino';
import { LogOptions } from '../types.js';

const defaultOptions = {
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
  browser: { asObject: false },
};

export function initLogger({ level = 'info' }: LogOptions = { level: 'info', useStdErr: false }) {
  return { logger: pino({ ...defaultOptions, level }), options: { level } };
}
