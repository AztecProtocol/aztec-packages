/** Structured log data to include with the message. */
export type LogData = Record<string, string | number | bigint | boolean | { toString(): string } | undefined | null>;

/**
 * A callable logger instance. Supports Pino format string interpolation (%s, %d, %o, %j).
 * Format args are interpolated into the message string and bypass redaction — never pass
 * sensitive values (private keys, mnemonics) as format args; use structured data instead.
 *
 */
export type LogFn = (msg: string, ...args: unknown[]) => void;
