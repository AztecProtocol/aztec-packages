import type { pino } from 'pino';

/* eslint-disable camelcase */

const GOOGLE_CLOUD_TRACE_ID = 'logging.googleapis.com/trace';
const GOOGLE_CLOUD_SPAN_ID = 'logging.googleapis.com/spanId';
const GOOGLE_CLOUD_TRACE_SAMPLED = 'logging.googleapis.com/trace_sampled';

/**
 * Pino configuration for google cloud observability. Tweaks message and timestamp,
 * adds trace context attributes, and injects severity level.
 * Adapted from https://cloud.google.com/trace/docs/setup/nodejs-ot#config-structured-logging.
 */
export const GoogleCloudLoggerConfig = {
  messageKey: 'message',
  // Same as pino.stdTimeFunctions.isoTime but uses "timestamp" key instead of "time"
  timestamp(): string {
    return `,"timestamp":"${new Date(Date.now()).toISOString()}"`;
  },
  formatters: {
    log(object: Record<string, unknown>): Record<string, unknown> {
      // Add trace context attributes following Cloud Logging structured log format described
      // in https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
      const { trace_id, span_id, trace_flags, ...rest } = object;

      if (trace_id && span_id) {
        return {
          [GOOGLE_CLOUD_TRACE_ID]: trace_id,
          [GOOGLE_CLOUD_SPAN_ID]: span_id,
          [GOOGLE_CLOUD_TRACE_SAMPLED]: trace_flags ? trace_flags === '01' : undefined,
          trace_flags, // Keep the original trace_flags for otel-pino-stream
          ...rest,
        };
      }
      return object;
    },
    level(label: string, level: number): object {
      // Inspired by https://github.com/pinojs/pino/issues/726#issuecomment-605814879
      // Severity labels https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
      let severity: string;

      switch (label as pino.Level | keyof CustomLevels) {
        case 'trace':
        case 'debug':
          severity = 'DEBUG';
          break;
        case 'verbose':
        case 'info':
          severity = 'INFO';
          break;
        case 'warn':
          severity = 'WARNING';
          break;
        case 'error':
          severity = 'ERROR';
          break;
        case 'fatal':
          severity = 'CRITICAL';
          break;
        default:
          severity = 'DEFAULT';
          break;
      }

      return { severity, level };
    },
  },
} satisfies pino.LoggerOptions;

// Define custom logging levels for pino. Duplicate from pino-logger.ts.
type CustomLevels = { verbose: 25 };
