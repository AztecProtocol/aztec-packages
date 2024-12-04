import { createColors } from 'colorette';
import isNode from 'detect-node';
import { pino, symbols } from 'pino';
import pretty from 'pino-pretty';
import { type Writable } from 'stream';
import { inspect } from 'util';

import { compactArray } from '../collection/array.js';
import { getLogLevelFromFilters, parseEnv } from './log-filters.js';
import { type LogLevel } from './log-levels.js';
import { type LogData, type LogFn } from './log_fn.js';

export function createLogger(module: string): Logger {
  // TODO(palla/log): Rename all module names to remove the aztec prefix
  const pinoLogger = logger.child(
    { module: module.replace(/^aztec:/, '') },
    { level: getLogLevelFromFilters(logFilters, module) },
  );

  // We check manually for isLevelEnabled to avoid calling processLogData unnecessarily.
  // Note that isLevelEnabled is missing from the browser version of pino.
  const logFn = (level: LogLevel, msg: string, data?: LogData) =>
    isLevelEnabled(pinoLogger, level) && pinoLogger[level](processLogData(data ?? {}), msg);

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
    isLevelEnabled: (level: LogLevel) => isLevelEnabled(pinoLogger, level),
  };
}

// Allow global hooks for processing log data.
// Used for injecting OTEL trace_id in telemetry client.
type LogDataHandler = (data: LogData) => LogData;
const logDataHandlers: LogDataHandler[] = [];

export function addLogDataHandler(handler: LogDataHandler): void {
  logDataHandlers.push(handler);
}

function processLogData(data: LogData): LogData {
  return logDataHandlers.reduce((accum, handler) => handler(accum), data);
}

// Patch isLevelEnabled missing from pino/browser.
function isLevelEnabled(logger: pino.Logger<'verbose', boolean>, level: LogLevel): boolean {
  return typeof logger.isLevelEnabled === 'function'
    ? logger.isLevelEnabled(level)
    : logger.levels.values[level] >= logger.levels.values[logger.level];
}

// Load log levels from environment variables.
const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
const [logLevel, logFilters] = parseEnv(process.env.LOG_LEVEL, defaultLogLevel);

// Transport options for pretty logging to stderr via pino-pretty.
const useColor = true;
const { bold, reset } = createColors({ useColor });
const pinoPrettyOpts = {
  destination: 2,
  sync: true,
  colorize: useColor,
  ignore: 'module,pid,hostname,trace_id,span_id,trace_flags',
  messageFormat: `${bold('{module}')} ${reset('{msg}')}`,
  customLevels: 'fatal:60,error:50,warn:40,info:30,verbose:25,debug:20,trace:10',
  customColors: 'fatal:bgRed,error:red,warn:yellow,info:green,verbose:magenta,debug:blue,trace:gray',
  minimumLevel: 'trace' as const,
};
const prettyTransport: pino.TransportSingleOptions = {
  target: 'pino-pretty',
  options: pinoPrettyOpts,
};

// Transport for vanilla stdio logging as JSON.
const stdioTransport: pino.TransportSingleOptions = {
  target: 'pino/file',
  options: { destination: 2 },
};

// Define custom logging levels for pino.
const customLevels = { verbose: 25 };
const pinoOpts = { customLevels, useOnlyCustomLevels: false, level: logLevel };

export const levels = {
  labels: { ...pino.levels.labels, ...Object.fromEntries(Object.entries(customLevels).map(e => e.reverse())) },
  values: { ...pino.levels.values, ...customLevels },
};

// Transport for OpenTelemetry logging. While defining this here is an abstraction leakage since this
// should live in the telemetry-client, it is necessary to ensure that the logger is initialized with
// the correct transport. Tweaking transports of a live pino instance is tricky, and creating a new instance
// would mean that all child loggers created before the telemetry-client is initialized would not have
// this transport configured. Note that the target is defined as the export in the telemetry-client,
// since pino will load this transport separately on a worker thread, to minimize disruption to the main loop.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
const otelOpts = { levels };
const otelTransport: pino.TransportSingleOptions = {
  target: '@aztec/telemetry-client/otel-pino-stream',
  options: otelOpts,
};

function makeLogger() {
  if (!isNode) {
    // We are on the browser
    return pino({ ...pinoOpts, browser: { asObject: false } });
  } else if (process.env.JEST_WORKER_ID) {
    // We are on jest, so we need sync logging. We stream to stderr with pretty.
    return pino(pinoOpts, pretty(pinoPrettyOpts));
  } else {
    // Regular nodejs with transports on worker thread, using pino-pretty for console logging if LOG_JSON
    // is not set, and an optional OTLP transport if the OTLP endpoint is provided.
    const targets: pino.TransportSingleOptions[] = compactArray([
      ['1', 'true', 'TRUE'].includes(process.env.LOG_JSON ?? '') ? stdioTransport : prettyTransport,
      otlpEndpoint ? otelTransport : undefined,
    ]);
    return pino(pinoOpts, pino.transport({ targets }));
  }
}

const logger = makeLogger();

// Log the logger configuration.
logger.verbose(
  {
    module: 'logger',
    ...logFilters.reduce((accum, [module, level]) => ({ ...accum, [`log.${module}`]: level }), {}),
  },
  isNode
    ? `Logger initialized with level ${logLevel}` + (otlpEndpoint ? ` with OTLP exporter to ${otlpEndpoint}` : '')
    : `Browser console logger initialized with level ${logLevel}`,
);

/**
 * Registers an additional destination to the pino logger.
 * Use only when working with destinations, not worker transports.
 */
export function registerLoggingStream(stream: Writable): void {
  logger.verbose({ module: 'logger' }, `Registering additional logging stream`);
  const original = (logger as any)[symbols.streamSym];
  const destination = original
    ? pino.multistream(
        [
          // Set streams to lowest logging level, and control actual logging from the parent logger
          // otherwise streams default to info and refuse to log anything below that.
          { level: 'trace', stream: original },
          { level: 'trace', stream },
        ],
        { levels: levels.values },
      )
    : stream;
  (logger as any)[symbols.streamSym] = destination;
}

/** Log function that accepts an exception object */
type ErrorLogFn = (msg: string, err?: Error | unknown, data?: LogData) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in LogLevel]: LogFn } & { /** Error log function */ error: ErrorLogFn } & {
  level: LogLevel;
  isLevelEnabled: (level: LogLevel) => boolean;
};

/**
 * Concatenates a log message and an exception.
 * @param msg - Log message
 * @param err - Error to log
 * @returns A string with both the log message and the error message.
 */
function formatErr(msg: string, err?: Error | unknown): string {
  return err ? `${msg}: ${inspect(err)}` : msg;
}
