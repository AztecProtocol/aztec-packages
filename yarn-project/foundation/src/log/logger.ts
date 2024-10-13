import debug from 'debug';
import { inspect } from 'util';



import { type LogData, type LogFn, LogOptions } from './log_fn.js';


const LogLevels = ['silent', 'error', 'warn', 'info', 'verbose', 'debug'] as const;

/**
 * A valid log severity level.
 */
export type LogLevel = (typeof LogLevels)[number];

function getLogLevel() {
  const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  const defaultNonTestLogLevel = process.env.DEBUG === undefined ? ('info' as const) : ('debug' as const);
  const defaultLogLevel = process.env.NODE_ENV === 'test' ? ('silent' as const) : defaultNonTestLogLevel;
  return LogLevels.includes(envLogLevel) ? envLogLevel : defaultLogLevel;
}

export let currentLevel = getLogLevel();

const namespaces = process.env.DEBUG ?? 'aztec:*';
debug.enable(namespaces);

/** Log function that accepts an exception object */
type ErrorLogFn = (msg: string, err?: Error | unknown, data?: LogData, options?: LogOptions) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in Exclude<LogLevel, 'error'>]: LogFn } & { /** Error log function */ error: ErrorLogFn };

/**
 * Logger that supports multiple severity levels and can be called directly to issue a debug statement.
 * Intended as a drop-in replacement for the debug module.
 */
export type DebugLogger = Logger;

export interface DebuggerLoggerOptions {
  fixedLogData?: LogData;
}

interface DebuggerLoggerState extends DebuggerLoggerOptions {
  lastLogMessage?: string;
}

/**
 * Creates a new DebugLogger for the current module, defaulting to the LOG_LEVEL env var.
 * If DEBUG="[module]" env is set, will enable debug logging if the module matches.
 * Uses npm debug for debug level and console.error for other levels.
 * @param name - Name of the module.
 * @param fixedLogData - Additional data to include in the log message.
 * @usage createDebugLogger('aztec:validator', {validatorAddress: '0x1234...'});
 * // will always add the validator address to the log labels
 * @returns A debug logger.
 */

export function createDebugLogger(name: string, options?: DebuggerLoggerOptions): DebugLogger {
  const debugLogger = debug(name);
  // Copied so we can be sure it is mutable
  const logState = { ...options };

  const logger = {
    silent: () => {},
    error: (msg: string, err?: unknown, data?: LogData, options?: LogOptions) =>
      logWithDebug(debugLogger, 'error', fmtErr(msg, err), data, logState, options),
    warn: (msg: string, data?: LogData, options?: LogOptions) =>
      logWithDebug(debugLogger, 'warn', msg, data, logState, options),
    info: (msg: string, data?: LogData, options?: LogOptions) =>
      logWithDebug(debugLogger, 'info', msg, data, logState, options),
    verbose: (msg: string, data?: LogData, options?: LogOptions) =>
      logWithDebug(debugLogger, 'verbose', msg, data, logState, options),
    debug: (msg: string, data?: LogData, options?: LogOptions) =>
      logWithDebug(debugLogger, 'debug', msg, data, logState, options),
  };
  return Object.assign(
    (msg: string, data?: LogData, options?: LogOptions) => logger.debug(msg, data, options),
    logger,
  );
}
/** A callback to capture all logs. */
export type LogHandler = (level: LogLevel, namespace: string, msg: string, data?: LogData) => void;

const logHandlers: LogHandler[] = [];

/**
 * Registers a callback for all logs, whether they are emitted in the current log level or not.
 * @param handler - Callback to be called on every log.
 */
export function onLog(handler: LogHandler) {
  logHandlers.push(handler);
}

/** Overrides current log level. */
export function setLevel(level: LogLevel) {
  currentLevel = level;
}

/**
 * Logs args to npm debug if enabled or log level is debug, console.error otherwise.
 * @param debug - Instance of npm debug.
 * @param level - Intended log level.
 * @param args - Args to log.
 */
function logWithDebug(
  debug: debug.Debugger,
  level: LogLevel,
  msg: string,
  data: LogData | undefined,
  logState: DebuggerLoggerState,
  options?: LogOptions
) {
  if (logState.fixedLogData) {
    // Attach fixed log data that will be bundled in every message, providing context on this logger
    data = { ...logState.fixedLogData, ...data };
  }
  for (const handler of logHandlers) {
    handler(level, debug.namespace, msg, data);
  }

  msg = data ? `${msg} ${fmtLogData(data)}` : msg;
  if (options?.ignoreImmediateDuplicates && logState.lastLogMessage === msg) {
    // Early exit as we are only configured to log on changes in logged data
    return;
  }
  if (debug.enabled && LogLevels.indexOf(level) <= LogLevels.indexOf(currentLevel)) {
    debug('[%s] %s', level.toUpperCase(), msg);
    logState.lastLogMessage = msg;
  }
}

/**
 * Concatenates a log message and an exception.
 * @param msg - Log message
 * @param err - Error to log
 * @returns A string with both the log message and the error message.
 */
function fmtErr(msg: string, err?: Error | unknown): string {
  return err ? `${msg}: ${inspect(err)}` : msg;
}

/**
 * Formats structured log data as a string for console output.
 * @param data - Optional log data.
 */
export function fmtLogData(data?: LogData): string {
  return Object.entries(data ?? {})
    .map(([key, value]) => `${key}=${typeof value === 'object' && 'toString' in value ? value.toString() : value}`)
    .join(' ');
}