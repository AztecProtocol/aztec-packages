import { type Color, createColors, isColorSupported } from 'colorette';
import isNode from 'detect-node';
import { pino, symbols } from 'pino';
import type { Writable } from 'stream';
import { inspect } from 'util';

import { compactArray } from '../collection/array.js';
import type { EnvVar } from '../config/index.js';
import { parseBooleanEnv } from '../config/parse-env.js';
import { convertBigintsToStrings } from './bigint-utils.js';
import { GoogleCloudLoggerConfig } from './gcloud-logger-config.js';
import { getLogLevelFromFilters, parseLogLevelEnvVar } from './log-filters.js';
import type { LogLevel } from './log-levels.js';
import type { LogData, LogFn } from './log_fn.js';

/** Optional bindings to pass to createLogger for additional context. */
export type LoggerBindings = {
  /** Actor label shown in logs (e.g., 'MAIN', 'prover-node'). */
  actor?: string;
  /** Instance identifier for distinguishing multiple instances of the same component. */
  instanceId?: string;
};

// Allow global hooks for providing default bindings.
// Used by withLoggerBindings in pino-logger-server to propagate bindings via AsyncLocalStorage.
type LogBindingsHandler = () => LoggerBindings | undefined;
const logBindingsHandlers: LogBindingsHandler[] = [];

export function addLogBindingsHandler(handler: LogBindingsHandler): void {
  logBindingsHandlers.push(handler);
}

export function removeLogBindingsHandler(handler: LogBindingsHandler) {
  const index = logBindingsHandlers.indexOf(handler);
  if (index !== -1) {
    logBindingsHandlers.splice(index, 1);
  }
}

function getBindingsFromHandlers(): LoggerBindings | undefined {
  for (const handler of logBindingsHandlers) {
    const bindings = handler();
    if (bindings) {
      return bindings;
    }
  }
  return undefined;
}

export function createLogger(module: string, bindings?: LoggerBindings): Logger {
  module = module.replace(/^aztec:/, '');

  const resolvedBindings = { ...getBindingsFromHandlers(), ...bindings };
  const actor = resolvedBindings?.actor;
  const instanceId = resolvedBindings?.instanceId;

  const pinoLogger = logger.child(
    { module, ...(actor && { actor }), ...(instanceId && { instanceId }) },
    { level: getLogLevelFromFilters(logFilters, module) },
  );

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
    /** Creates another logger by extending this logger module name and preserving bindings. */
    createChild: (childModule: string) => createLogger(`${module}:${childModule}`, { actor, instanceId }),
    /** Returns the bindings (actor, instanceId) for this logger. */
    getBindings: () => ({ actor, instanceId }),
  };
}

/**
 * Returns a logger for the given module. If loggerOrBindings is already a Logger, returns it directly.
 * Otherwise, creates a new logger with the given module name and bindings.
 */
export function resolveLogger(module: string, loggerOrBindings?: Logger | LoggerBindings): Logger {
  if (loggerOrBindings && 'info' in loggerOrBindings) {
    return loggerOrBindings as Logger;
  }
  return createLogger(module, loggerOrBindings);
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
export const [logLevel, logFilters] = parseLogLevelEnvVar(process.env.LOG_LEVEL, defaultLogLevel);

// Define custom logging levels for pino.
const customLevels = { verbose: 25 };

// Global pino options, tweaked for google cloud if running there.
const useGcloudLogging = parseBooleanEnv(process.env['USE_GCLOUD_LOGGING' satisfies EnvVar]);

const redactedPaths = [
  'validatorPrivateKeys',
  // for both the validator and the prover
  'publisherPrivateKeys',
  'peerIdPrivateKey',
  // bot keys
  'l1PrivateKey',
  'senderPrivateKey',
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
  formatters: {
    log: obj => convertBigintsToStrings(obj) as Record<string, unknown>,
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
const { bold, reset, cyan, magenta, yellow, blue, green, magentaBright, yellowBright, blueBright, greenBright } =
  createColors({ useColor });

// Per-actor coloring: each unique actor gets a different color for easier visual distinction.
// Disabled when LOG_NO_COLOR_PER_ACTOR is set to a truthy value.
const useColorPerActor = useColor && !parseBooleanEnv(process.env['LOG_NO_COLOR_PER_ACTOR' satisfies EnvVar]);
const actorColors: Color[] = [yellow, magenta, blue, green, magentaBright, yellowBright, blueBright, greenBright];
const actorColorMap = new Map<string, Color>();
let nextColorIndex = 0;

/** Returns the color function assigned to a given actor, assigning a new one if needed. */
export function getActorColor(actor: string): Color {
  let color = actorColorMap.get(actor);
  if (!color) {
    color = actorColors[nextColorIndex % actorColors.length];
    actorColorMap.set(actor, color);
    nextColorIndex++;
  }
  return color;
}

/** Resets the actor-to-color mapping. Useful for testing. */
export function resetActorColors(): void {
  actorColorMap.clear();
  nextColorIndex = 0;
}

// String template for messageFormat (used in worker threads and when per-actor coloring is disabled).
const messageFormatString = `${bold('{module}')}{if actor} ${cyan('{actor}')}{end}{if instanceId} ${reset(cyan('{instanceId}'))}{end} ${reset('{msg}')}`;

// Function for messageFormat when per-actor coloring is enabled (can only be used in-process, not worker threads).
type LogObject = { actor?: string; module?: string; instanceId?: string; msg?: string };

/** Formats a log message with per-actor coloring. Actor, module, and instanceId share the same color. */
export function formatLogMessage(log: LogObject, messageKey: string): string {
  const actor = log.actor;
  const module = log.module ?? '';
  const instanceId = log.instanceId;
  const msg = log[messageKey as keyof LogObject] ?? '';

  // Use actor color for actor, module, and instanceId when actor is present
  const color = actor ? getActorColor(actor) : cyan;

  let result = bold(color(module));
  if (actor) {
    result += ' ' + color(actor);
  }
  if (instanceId) {
    result += ' ' + reset(color(instanceId));
  }
  result += ' ' + reset(String(msg));
  return result;
}

// Base options for pino-pretty (shared between transport and direct use).
const pinoPrettyBaseOpts = {
  destination: 2,
  sync: true,
  colorize: useColor,
  ignore: 'module,actor,instanceId,pid,hostname,trace_id,span_id,trace_flags,severity',
  customLevels: 'fatal:60,error:50,warn:40,info:30,verbose:25,debug:20,trace:10',
  customColors: 'fatal:bgRed,error:red,warn:yellow,info:green,verbose:magenta,debug:blue,trace:gray',
  minimumLevel: 'trace' as const,
  singleLine: !parseBooleanEnv(process.env['LOG_MULTILINE' satisfies EnvVar]),
};

/**
 * Pino-pretty options for direct use (e.g., jest/setup.mjs).
 * Includes function-based messageFormat for per-actor coloring when enabled.
 */
export const pinoPrettyOpts = {
  ...pinoPrettyBaseOpts,
  messageFormat: useColorPerActor ? formatLogMessage : messageFormatString,
};

// Transport options use string template only (functions can't be serialized to worker threads).
const prettyTransportOpts = {
  ...pinoPrettyBaseOpts,
  messageFormat: messageFormatString,
};

const prettyTransport: pino.TransportTargetOptions = {
  target: 'pino-pretty',
  options: prettyTransportOpts,
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
  /** Returns the bindings (actor, instanceId) for this logger. */
  getBindings: () => LoggerBindings;
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
