export const LogLevels = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;

export type LogLevel = (typeof LogLevels)[number];
