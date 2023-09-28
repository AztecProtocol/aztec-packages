import debug from 'debug';
import isNode from 'detect-node';
import { isatty } from 'tty';

import { LogFn } from './index.js';

// Matches a subset of Winston log levels
const LogLevels = ['silent', 'error', 'warn', 'info', 'verbose', 'debug'] as const;
const DefaultLogLevel = 'info' as const;

/**
 * A valid log severity level.
 */
type LogLevel = (typeof LogLevels)[number];

const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
const currentLevel = LogLevels.includes(envLogLevel) ? envLogLevel : DefaultLogLevel;

/** Log function that accepts an exception object */
type ErrorLogFn = (msg: string, err?: Error | unknown) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in LogLevel]: LogFn } & { /** Error log function */ error: ErrorLogFn };

/**
 * Logger that supports multiple severity levels and can be called directly to issue a debug statement.
 * Intended as a drop-in replacement for the debug module.
 */
export type DebugLogger = LogFn & Logger;

/**
 * Creates a new DebugLogger for the current module, defaulting to the LOG_LEVEL env var.
 * If DEBUG="[module]" env is set, will enable debug logging if the module matches.
 * Uses npm debug for debug level and console.error for other levels.
 * @param name - Name of the module.
 * @returns A debug logger.
 */
export function createDebugLogger(name: string): DebugLogger {
  const debugLogger = debug(name);
  if (currentLevel === 'debug') debugLogger.enabled = true;

  const logger = {
    silent: () => {},
    error: (msg: string, err?: Error | unknown) => logWithDebug(debugLogger, 'error', formatError(msg, err)),
    warn: (msg: string) => logWithDebug(debugLogger, 'warn', msg),
    info: (msg: string) => logWithDebug(debugLogger, 'info', msg),
    verbose: (msg: string) => logWithDebug(debugLogger, 'verbose', msg),
    debug: (msg: string) => logWithDebug(debugLogger, 'debug', msg),
  };
  return Object.assign((msg: string) => logWithDebug(debugLogger, 'debug', msg), logger);
}

/** A callback to capture all logs. */
export type LogHandler = (level: LogLevel, namespace: string, msg: string) => void;

const logHandlers: LogHandler[] = [];

/**
 * Registers a callback for all logs, whether they are emitted in the current log level or not.
 * @param handler - Callback to be called on every log.
 */
export function onLog(handler: LogHandler) {
  logHandlers.push(handler);
}

/**
 * Logs args to npm debug if enabled or log level is debug, console.error otherwise.
 * @param debug - Instance of npm debug.
 * @param level - Intended log level.
 * @param args - Args to log.
 */
function logWithDebug(debug: debug.Debugger, level: LogLevel, msg: string) {
  for (const handler of logHandlers) {
    handler(level, debug.namespace, msg);
  }
  if (debug.enabled) {
    debug(msg);
  } else if (LogLevels.indexOf(level) <= LogLevels.indexOf(currentLevel) && process.env.NODE_ENV !== 'test') {
    printLog(`${getPrefix(debug, level)} ${msg}`);
  }
}

/**
 * Returns a log prefix that emulates that of npm debug. Uses colors if in node and in a tty.
 * @param debugLogger - Instance of npm debug logger.
 * @param level - Intended log level (printed out if strictly above current log level).
 * @returns Log prefix.
 */
function getPrefix(debugLogger: debug.Debugger, level: LogLevel) {
  const levelLabel = currentLevel !== level ? ` ${level.toUpperCase()}` : '';
  const prefix = `${debugLogger.namespace.replace(/^aztec:/, '')}${levelLabel}`;
  if (!isNode || !isatty(process.stderr.fd)) return prefix;
  const colorIndex = debug.selectColor(debugLogger.namespace) as number;
  const colorCode = '\u001B[3' + (colorIndex < 8 ? colorIndex : '8;5;' + colorIndex);
  return `  ${colorCode};1m${prefix}\u001B[0m`;
}

/**
 * Outputs to console error.
 * @param msg - What to log.
 */
function printLog(msg: string) {
  // eslint-disable-next-line no-console
  console.error(msg);
}

/**
 * Concatenates a log message and an exception.
 * @param msg - Log message
 * @param err - Error to log
 * @returns A string with both the log message and the error message.
 */
function formatError(msg: string, err?: Error | unknown): string {
  const errStr = err && [(err as Error).name, (err as Error).message].filter(x => !!x).join(' ');
  return err ? `${msg}: ${errStr || err}` : msg;
}
