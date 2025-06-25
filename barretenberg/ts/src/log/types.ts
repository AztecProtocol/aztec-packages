export type LogLevels = 'silent' | 'info' | 'debug' | 'warn' | 'error' | 'trace' | 'verbose';

export type LogOptions = {
  level: LogLevels;
  useStdErr: boolean;
};
