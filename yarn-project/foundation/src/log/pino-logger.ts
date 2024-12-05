import { bold, reset } from 'colorette';
import { type LoggerOptions, pino } from 'pino';
import { inspect } from 'util';

import { getLogLevelFromFilters, parseEnv } from './log-filters.js';
import { type LogLevel } from './log-levels.js';
import { type LogData, type LogFn } from './log_fn.js';

// TODO(palla/log): Rename to createLogger
export function createDebugLogger(module: string): DebugLogger {
  // TODO(palla/log): Rename all module names to remove the aztec prefix
  const pinoLogger = logger.child(
    { module: module.replace(/^aztec:/, '') },
    { level: getLogLevelFromFilters(logFilters, module) },
  );

  const logFn = (level: LogLevel, msg: string, data?: LogData) => pinoLogger[level](data ?? {}, msg);

  return {
    silent: () => {},
    // TODO(palla/log): Should we move err to data instead of the text message?
    /** Log as fatal. Use when an error has brought down the system. */
    fatal: (msg: string, err?: unknown, data?: LogData) => logFn('fatal', formatErr(msg, err), data),
    /** Log as error. Use for errors in general. */
    error: (msg: string, err?: unknown, data?: LogData) => logFn('error', formatErr(msg, err), data),
    /** Log as warn. Use for when we stray from the happy path. */
    warn: (msg: string, data?: LogData) => logFn('warn', msg, data),
    /** Log as info. Use for providing an operator with info on what the system is doing. */
    info: (msg: string, data?: LogData) => logFn('info', msg, data),
    /** Log as verbose. Use for when we need additional insight on what a subsystem is doing. */
    verbose: (msg: string, data?: LogData) => logFn('verbose', msg, data),
    /** Log as debug. Use for when we need debugging info to troubleshoot an issue on a specific component. */
    debug: (msg: string, data?: LogData) => logFn('debug', msg, data),
    /** Log as trace. Use for when we want to denial-of-service any recipient of the logs. */
    trace: (msg: string, data?: LogData) => logFn('trace', msg, data),
    level: pinoLogger.level as LogLevel,
  };
}

const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
const [logLevel, logFilters] = parseEnv(process.env.LOG_LEVEL, defaultLogLevel);

const pretty: Pick<LoggerOptions, 'transport'> = {
  transport: {
    target: 'pino-pretty',
    options: {
      sync: true,
      ignore: 'module,pid,hostname',
      messageFormat: `${bold('{module}')} ${reset('{msg}')}`,
      customLevels: 'fatal:60,error:50,warn:40,info:30,verbose:25,debug:20,trace:10',
      customColors: 'fatal:bgRed,error:red,warn:yellow,info:green,verbose:magenta,debug:blue,trace:gray',
    },
  },
};

const logger = pino({
  customLevels: {
    verbose: 25,
  },
  useOnlyCustomLevels: false,
  level: logLevel,
  ...(['1', 'true', 'TRUE'].includes(process.env.LOG_JSON ?? '') ? {} : pretty),
});

logger.info(
  { module: 'logger', ...logFilters.reduce((accum, [module, level]) => ({ ...accum, [`log.${module}`]: level }), {}) },
  `Console logger initialized with level ${logLevel}`,
);

/** Log function that accepts an exception object */
type ErrorLogFn = (msg: string, err?: Error | unknown, data?: LogData) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in LogLevel]: LogFn } & { /** Error log function */ error: ErrorLogFn } & { level: LogLevel };

/**
 * Logger that supports multiple severity levels and can be called directly to issue a debug statement.
 * Intended as a drop-in replacement for the debug module.
 * TODO(palla/log): Remove this alias
 */
export type DebugLogger = Logger;

/**
 * Concatenates a log message and an exception.
 * @param msg - Log message
 * @param err - Error to log
 * @returns A string with both the log message and the error message.
 */
function formatErr(msg: string, err?: Error | unknown): string {
  return err ? `${msg}: ${inspect(err)}` : msg;
}
