// Based on https://github.com/open-telemetry/opentelemetry-js-contrib/blob/9a20e15547669450987b2bb7cab193f17e04ebb7/packages/winston-transport/src/utils.ts
// Not wanting to pull in the entire winston transport
import { type LogData, type LogLevel, onLog } from '@aztec/foundation/log';

import {
  type LogAttributes as OtelLogAttributes,
  type LogRecord as OtelLogRecord,
  type Logger as OtelLogger,
  SeverityNumber as OtelSeverity,
} from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { type IResource } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const npmLevels: Record<string, number> = {
  error: OtelSeverity.ERROR,
  warn: OtelSeverity.WARN,
  info: OtelSeverity.INFO,
  http: OtelSeverity.DEBUG3,
  verbose: OtelSeverity.DEBUG2,
  debug: OtelSeverity.DEBUG,
  silly: OtelSeverity.TRACE,
};

const sysLoglevels: Record<string, number> = {
  emerg: OtelSeverity.FATAL3,
  alert: OtelSeverity.FATAL2,
  crit: OtelSeverity.FATAL,
  error: OtelSeverity.ERROR,
  warning: OtelSeverity.WARN,
  notice: OtelSeverity.INFO2,
  info: OtelSeverity.INFO,
  debug: OtelSeverity.DEBUG,
};

const cliLevels: Record<string, number> = {
  error: OtelSeverity.ERROR,
  warn: OtelSeverity.WARN,
  help: OtelSeverity.INFO3,
  data: OtelSeverity.INFO2,
  info: OtelSeverity.INFO,
  debug: OtelSeverity.DEBUG,
  prompt: OtelSeverity.TRACE4,
  verbose: OtelSeverity.TRACE3,
  input: OtelSeverity.TRACE2,
  silly: OtelSeverity.TRACE,
};

function getOtelSeverity(level: string): OtelSeverity | undefined {
  return npmLevels[level] ?? sysLoglevels[level] ?? cliLevels[level];
}

export function emitLogRecord(logger: OtelLogger, level: LogLevel, message: string, data?: LogData): void {
  const logRecord: OtelLogRecord = {
    severityNumber: getOtelSeverity(level),
    severityText: level,
    body: message,
    attributes: (data || {}) as OtelLogAttributes,
  };
  (console as any).log("LOG", logRecord);
  logger.emit(logRecord);
}

export function registerOtelLoggerProvider(resource: IResource, otelLogsUrl?: URL) {
  const loggerProvider = new LoggerProvider();
  if (!otelLogsUrl) {
    // If no URL provided, return it disconnected.
    return loggerProvider;
  }
  const logExporter = new OTLPLogExporter({
    url: otelLogsUrl.href,
  });
  // Add a processor to the logger provider
  loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(logExporter));

  const loggers: { [module: string]: OtelLogger } = {};
  onLog((level, module, message, data) => {
    loggers[module] = loggers[module] || loggerProvider.getLogger(module, resource.attributes[SEMRESATTRS_SERVICE_VERSION] as string);
    emitLogRecord(loggers[module], level, message, data);
  });
  return loggerProvider;
}
