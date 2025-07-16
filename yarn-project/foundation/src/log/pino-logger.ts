import { createColors, isColorSupported } from 'colorette';
import isNode from 'detect-node';
import { pino, symbols } from 'pino';
import type { Writable } from 'stream';
import { inspect } from 'util';

import { compactArray } from '../collection/array.js';
import { type EnvVar, parseBooleanEnv } from '../config/index.js';
import { GoogleCloudLoggerConfig } from './gcloud-logger-config.js';
import { getLogLevelFromFilters, parseEnv } from './log-filters.js';
import type { LogLevel } from './log-levels.js';
import type { LogData, LogFn } from './log_fn.js';

export function createLogger(module: string): Logger {
  module = logNameHandlers.reduce((moduleName, handler) => handler(moduleName), module.replace(/^aztec:/, ''));
  const pinoLogger = logger.child({ module }, { level: getLogLevelFromFilters(logFilters, module) });

  // We check manually for isLevelEnabled to avoid calling processLogData unnecessarily.
  // Note that isLevelEnabled is missing from the browser version of pino.
  const logFn = (level: LogLevel, msg: string, data?: unknown) =>
    isLevelEnabled(pinoLogger, level) && pinoLogger[level](processLogData((data as LogData) ?? {}), msg);

  return {
    silent: () => {},
    // TODO(palla/log): Should we move err to data instead of the text message?
    /** Log as fatal. Use when an error has brought down the system. */
    fatal: (msg: string, err?: unknown, data?: unknown) => logFn('fatal', formatErr(msg, err), data),
    /** Log as error. Use for errors in general. */
    error: (msg: string, err?: unknown, data?: unknown) => logFn('error', formatErr(msg, err), data),
    /** Log as warn. Use for when we stray from the happy path. */
    warn: (msg: string, data?: unknown) => logFn('warn', msg, data),
    /** Log as info. Use for providing an operator with info on what the system is doing. */
    info: (msg: string, data?: unknown) => logFn('info', msg, data),
    /** Log as verbose. Use for when we need additional insight on what a subsystem is doing. */
    verbose: (msg: string, data?: unknown) => logFn('verbose', msg, data),
    /** Log as debug. Use for when we need debugging info to troubleshoot an issue on a specific component. */
    debug: (msg: string, data?: unknown) => logFn('debug', msg, data),
    /** Log as trace. Use for when we want to denial-of-service any recipient of the logs. */
    trace: (msg: string, data?: unknown) => logFn('trace', msg, data),
    /** Level of the logger */
    level: pinoLogger.level as LogLevel,
    /** Whether the given level is enabled for this logger. */
    isLevelEnabled: (level: LogLevel) => isLevelEnabled(pinoLogger, level),
    /** Module name for the logger. */
    module,
    /** Creates another logger by extending this logger module name. */
    createChild: (childModule: string) => createLogger(`${module}:${childModule}`),
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

// Allow global hooks for tweaking module names.
// Used in tests to add a uid to modules, so we can differentiate multiple nodes in the same process.
type LogNameHandler = (module: string) => string;
const logNameHandlers: LogNameHandler[] = [];

export function addLogNameHandler(handler: LogNameHandler): void {
  logNameHandlers.push(handler);
}

export function removeLogNameHandler(handler: LogNameHandler) {
  const index = logNameHandlers.indexOf(handler);
  if (index !== -1) {
    logNameHandlers.splice(index, 1);
  }
}

/** Creates all loggers within the given callback with the suffix appended to the module name. */
export async function withLogNameSuffix<T>(suffix: string, callback: () => Promise<T>): Promise<T> {
  const logNameHandler = (module: string) => `${module}:${suffix}`;
  addLogNameHandler(logNameHandler);
  const result = await callback();
  removeLogNameHandler(logNameHandler);
  return result;
}

// Patch isLevelEnabled missing from pino/browser.
function isLevelEnabled(logger: pino.Logger<'verbose', boolean>, level: LogLevel): boolean {
  return typeof logger.isLevelEnabled === 'function'
    ? logger.isLevelEnabled(level)
    : logger.levels.values[level] >= logger.levels.values[logger.level];
}

// Load log levels from environment variables.
const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
export const [logLevel, logFilters] = parseEnv(process.env.LOG_LEVEL, defaultLogLevel);

// Define custom logging levels for pino.
const customLevels = { verbose: 25 };

// Global pino options, tweaked for google cloud if running there.
const useGcloudLogging = parseBooleanEnv(process.env['USE_GCLOUD_LOGGING' satisfies EnvVar]);

const redactedPaths = [
  'validatorPrivateKeys',
  'slasherPrivateKey',
  // for both the validator and the prover
  'publisherPrivateKey',
  'peerIdPrivateKey',
  // bot keys
  'l1PrivateKey',
  'senderPrivateKey',
  'recipientEncryptionSecret',
  // blob sink
  'l1ConsensusHostApiKeys',
  // sensitive options used in the CLI
  'privateKey',
  'mnemonic',
  'l1Mnemonic',
  'l1PrivateKey',
];

const pinoOpts: pino.LoggerOptions<keyof typeof customLevels> = {
  customLevels,
  messageKey: 'msg',
  useOnlyCustomLevels: false,
  level: logLevel,
  redact: {
    paths: [
      ...redactedPaths,
      ...redactedPaths.map(p => `config.${p}`),
      ...redactedPaths.map(p => `cfg.${p}`),
      ...redactedPaths.map(p => `options.${p}`),
      ...redactedPaths.map(p => `opts.${p}`),
    ],
  },
  ...(useGcloudLogging ? GoogleCloudLoggerConfig : {}),
};

export const levels = {
  labels: { ...pino.levels.labels, ...Object.fromEntries(Object.entries(customLevels).map(e => e.reverse())) },
  values: { ...pino.levels.values, ...customLevels },
};

// Transport options for pretty logging to stderr via pino-pretty.
const colorEnv = process.env['FORCE_COLOR' satisfies EnvVar];
const useColor = colorEnv === undefined ? isColorSupported : parseBooleanEnv(colorEnv);
const { bold, reset } = createColors({ useColor });
export const pinoPrettyOpts = {
  destination: 2,
  sync: true,
  colorize: useColor,
  ignore: 'module,pid,hostname,trace_id,span_id,trace_flags,severity',
  messageFormat: `${bold('{module}')} ${reset('{msg}')}`,
  customLevels: 'fatal:60,error:50,warn:40,info:30,verbose:25,debug:20,trace:10',
  customColors: 'fatal:bgRed,error:red,warn:yellow,info:green,verbose:magenta,debug:blue,trace:gray',
  minimumLevel: 'trace' as const,
  singleLine: !parseBooleanEnv(process.env['LOG_MULTILINE' satisfies EnvVar]),
};

const prettyTransport: pino.TransportTargetOptions = {
  target: 'pino-pretty',
  options: pinoPrettyOpts,
  level: 'trace',
};

// Transport for vanilla stdio logging as JSON.
const stdioTransport: pino.TransportTargetOptions = {
  target: 'pino/file',
  options: { destination: 2 },
  level: 'trace',
};

// Transport for OpenTelemetry logging. While defining this here is an abstraction leakage since this
// should live in the telemetry-client, it is necessary to ensure that the logger is initialized with
// the correct transport. Tweaking transports of a live pino instance is tricky, and creating a new instance
// would mean that all child loggers created before the telemetry-client is initialized would not have
// this transport configured. Note that the target is defined as the export in the telemetry-client,
// since pino will load this transport separately on a worker thread, to minimize disruption to the main loop.
const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_LOGS_ENDPOINT' satisfies EnvVar];
const otlpEnabled = !!otlpEndpoint && !useGcloudLogging;
const otelOpts = { levels };
const otelTransport: pino.TransportTargetOptions = {
  target: '@aztec/telemetry-client/otel-pino-stream',
  options: otelOpts,
  level: 'trace',
};
function makeLogger() {
  if (!isNode) {
    // We are on the browser.
    return pino({ ...pinoOpts, browser: { asObject: false } });
  }
  // If running in a child process then cancel this if statement section by uncommenting below
  // else if (false) {
  else if (process.env.JEST_WORKER_ID) {
    // We are on jest, so we need sync logging and stream to stderr.
    // We expect jest/setup.mjs to kick in later and replace set up a pretty logger,
    // but if for some reason it doesn't, at least we're covered with a default logger.
    return pino(pinoOpts, pino.destination(2));
  } else {
    // Regular nodejs with transports on worker thread, using pino-pretty for console logging if LOG_JSON
    // is not set, and an optional OTLP transport if the OTLP endpoint is set.
    const targets: pino.TransportSingleOptions[] = compactArray([
      parseBooleanEnv(process.env.LOG_JSON) ? stdioTransport : prettyTransport,
      otlpEnabled ? otelTransport : undefined,
    ]);
    return pino(pinoOpts, pino.transport({ targets, levels: levels.values }));
  }
}

export const logger = makeLogger();

// Log the logger configuration.
logger.verbose(
  {
    module: 'logger',
    ...logFilters.reduce((accum, [module, level]) => ({ ...accum, [`log.${module}`]: level }), {}),
  },
  isNode
    ? `Logger initialized with level ${logLevel}` + (otlpEnabled ? ` with OTLP exporter to ${otlpEndpoint}` : '')
    : `Browser console logger initialized with level ${logLevel}`,
);

/**
 * Overwrites the logging stream with a different destination.
 * Used by jest/setup.mjs to set up a pretty logger.
 */
export function overwriteLoggingStream(stream: Writable): void {
  (logger as any)[symbols.streamSym] = stream;
}

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
type ErrorLogFn = (msg: string, err?: unknown, data?: LogData) => void;

/**
 * Logger that supports multiple severity levels.
 */
export type Logger = { [K in LogLevel]: LogFn } & { /** Error log function */ error: ErrorLogFn } & {
  level: LogLevel;
  isLevelEnabled: (level: LogLevel) => boolean;
  module: string;
  createChild: (childModule: string) => Logger;
};

/**
 * Concatenates a log message and an exception.
 * @param msg - Log message
 * @param err - Error to log
 * @returns A string with both the log message and the error message.
 */
function formatErr(msg: string, err?: unknown): string {
  return err ? `${msg}: ${inspect(err)}` : msg;
}
