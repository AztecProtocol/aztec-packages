import { pino } from 'pino';
import { LogOptions } from '../types.js';

const defaultOptions = {
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
  browser: { asObject: false },
};

export function initLogger({ level = 'info', useStdErr = false }: LogOptions = { level: 'info', useStdErr: false }) {
  const transport = pino.transport({
    target: 'pino/file',
    options: { destination: useStdErr ? 2 : 1 },
  });
  return { logger: pino({ ...defaultOptions, level }, transport), options: { level, useStdErr } };
}
