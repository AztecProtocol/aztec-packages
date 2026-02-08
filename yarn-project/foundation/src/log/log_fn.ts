/** Structured log data to include with the message. */
export type LogData = Record<string, string | number | bigint | boolean | { toString(): string } | undefined | null>;

/**
 * A callable logger instance.
 * Supports pino-style format strings with %s, %d, %o placeholders.
 * @example
 * log('Simple message');
 * log('Message with %s placeholder', 'value');
 * log('Message with data', { key: 'value' });
 * log('Message with %s and data', 'value', { key: 'data' });
 */
export type LogFn = (msg: string, ...args: unknown[]) => void;
