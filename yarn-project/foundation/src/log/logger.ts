import debug from 'debug';
import { inspect } from 'util';

import { type LogData, type LogFn } from './log_fn.js';

const LogLevels = ['silent', 'error', 'warn', 'info', 'verbose', 'debug'] as const;

/**
 * A valid log severity level.
 */
export type LogLevel = (typeof LogLevels)[number];

function getLogLevel() {
  const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  const defaultNonTestLogLevel =
    process.env.DEBUG === undefined || process.env.DEBUG === '' ? ('info' as const) : ('debug' as const);
  const defaultLogLevel = process.env.NODE_ENV === 'test' ? ('silent' as const) : defaultNonTestLogLevel;
  return LogLevels.includes(envLogLevel) ? envLogLevel : defaultLogLevel;
}

export let currentLevel = getLogLevel();

function filterNegativePatterns(debugString: string): string {
  return debugString
    .split(',')
    .filter(p => !p.startsWith('-'))
    .join(',');
}
function extractNegativePatterns(debugString: string): string[] {
  return (
    debugString
      .split(',')
      .filter(p => p.startsWith('-'))
      // Remove the leading '-' from the pattern
      .map(p => p.slice(1))
  );
}

const namespaces = process.env.DEBUG ?? 'aztec:*';
debug.enable(filterNegativePatterns(namespaces));

/** Log function that accepts an exception object */
type ErrorLogFn = (msg: string, err?: Error | unknown, data?: LogData) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in LogLevel]: LogFn } & { /** Error log function */ error: ErrorLogFn };

/**
 * Logger that supports multiple severity levels and can be called directly to issue a debug statement.
 * Intended as a drop-in replacement for the debug module.
 */
export type DebugLogger = Logger;

/**
 * Creates a new DebugLogger for the current module, defaulting to the LOG_LEVEL env var.
 * If DEBUG="[module]" env is set, will enable debug logging if the module matches.
 * Uses npm debug for debug level and console.error for other levels.
 * @param name - Name of the module.
 * @param fixedLogData - Additional data to include in the log message.
 * @usage createDebugLogger('aztec:validator');
 * // will always add the validator address to the log labels
 * @returns A debug logger.
 */

export function createDebugLogger(name: string): DebugLogger {
  const debugLogger = debug(name);

  const negativePatterns = extractNegativePatterns(namespaces);
  const accepted = () => {
    return !negativePatterns.some(pattern => name.match(pattern));
  };
  const log = (level: LogLevel, msg: string, data?: LogData) => {
    if (accepted()) {
      logWithDebug(debugLogger, level, msg, data);
    }
  };
  const logger = {
    silent: () => {},
    error: (msg: string, err?: unknown, data?: LogData) => log('error', fmtErr(msg, err), data),
    warn: (msg: string, data?: LogData) => log('warn', msg, data),
    info: (msg: string, data?: LogData) => log('info', msg, data),
    verbose: (msg: string, data?: LogData) => log('verbose', msg, data),
    debug: (msg: string, data?: LogData) => log('debug', msg, data),
  };
  return Object.assign((msg: string, data?: LogData) => log('debug', msg, data), logger);
}

/**
 * A function to create a logger that automatically includes fixed data in each log entry.
 * @param debugLogger - The base DebugLogger instance to which we attach fixed log data.
 * @param fixedLogData - The data to be included in every log entry.
 * @returns A DebugLogger with log level methods (error, warn, info, verbose, debug) that
 * automatically attach `fixedLogData` to every log message.
 */
export function attachedFixedDataToLogger(debugLogger: DebugLogger, fixedLogData: LogData): DebugLogger {
  // Helper function to merge fixed data with additional data passed to log entries.
  const attach = (data?: LogData) => ({ ...fixedLogData, ...data });
  // Define the logger with all the necessary log level methods.
  const logger = {
    // Silent log level does nothing.
    silent: () => {},
    error: (msg: string, err?: unknown, data?: LogData) => debugLogger.error(fmtErr(msg, err), attach(data)),
    warn: (msg: string, data?: LogData) => debugLogger.warn(msg, attach(data)),
    info: (msg: string, data?: LogData) => debugLogger.info(msg, attach(data)),
    verbose: (msg: string, data?: LogData) => debugLogger.verbose(msg, attach(data)),
    debug: (msg: string, data?: LogData) => debugLogger.debug(msg, attach(data)),
  };
  return Object.assign((msg: string, data?: LogData) => debugLogger.debug(msg, attach(data)), logger);
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
function logWithDebug(debug: debug.Debugger, level: LogLevel, msg: string, data?: LogData) {
  for (const handler of logHandlers) {
    handler(level, debug.namespace, msg, data);
  }

  msg = data ? `${msg} ${fmtLogData(data)}` : msg;
  if (debug.enabled && LogLevels.indexOf(level) <= LogLevels.indexOf(currentLevel)) {
    debug('[%s] %s', level.toUpperCase(), msg);
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
