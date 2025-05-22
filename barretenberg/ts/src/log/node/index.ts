import { pino } from 'pino';
import { LogLevels, LogOptions } from '../types.js';

const defaultOptions = {
  name: 'bb.js',
  useOnlyCustomLevels: false,
  customLevels: { verbose: 25 },
};

const defaultLevel = (process.env.LOG_LEVEL || 'info') as LogLevels;

export function initLogger(
  { level = defaultLevel, useStdErr = false }: LogOptions = { level: defaultLevel, useStdErr: false },
) {
  const transport = pino.transport({
    target: 'pino/file',
    options: { destination: useStdErr ? 2 : 1 },
  });
  return { logger: pino({ ...defaultOptions, level }, transport), options: { level, useStdErr } };
}
