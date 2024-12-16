import { logs as otelLogs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { type IResource } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

import { getOtelResource } from './otel_resource.js';

export async function registerOtelLoggerProvider(resource?: IResource, otelLogsUrl?: URL) {
  resource ??= await getOtelResource();

  const loggerProvider = new LoggerProvider({ resource });
  if (!otelLogsUrl) {
    // If no URL provided, return it disconnected.
    return loggerProvider;
  }
  const logExporter = new OTLPLogExporter({
    compression: CompressionAlgorithm.GZIP,
    url: otelLogsUrl.href,
  });
  // Add a processor to the logger provider
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(logExporter, {
      /** The maximum batch size of every export. It must be smaller or equal to
       * maxQueueSize. */
      maxExportBatchSize: 1024,
      /** The maximum queue size. After the size is reached log records are dropped. */
      maxQueueSize: 4096,
    }),
  );

  otelLogs.setGlobalLoggerProvider(loggerProvider);

  return loggerProvider;
}
