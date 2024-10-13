/** Structured log data to include with the message. */
export type LogData = Record<string, string | number | bigint | boolean | { toString(): string } | undefined>;

export interface LogOptions {
  // Trigger logs only on a different value
  ignoreImmediateDuplicates?: boolean;
}

/** A callable logger instance. */
export type LogFn = (msg: string, data?: LogData, options?: LogOptions) => void;
