import { logs as otelLogs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

export function registerOtelLoggerProvider(otelLogsUrl?: URL) {
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
  otelLogs.setGlobalLoggerProvider(loggerProvider);

  return loggerProvider;
}
