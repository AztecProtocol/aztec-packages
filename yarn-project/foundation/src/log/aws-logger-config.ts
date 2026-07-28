import type { pino } from 'pino';

function getSeverity(label: string): { severityText: string; severityNumber: number } {
  switch (label) {
    case 'trace':
      return { severityText: 'TRACE', severityNumber: 1 };
    case 'debug':
      return { severityText: 'DEBUG', severityNumber: 5 };
    case 'verbose':
      return { severityText: 'VERBOSE', severityNumber: 7 };
    case 'info':
      return { severityText: 'INFO', severityNumber: 9 };
    case 'warn':
      return { severityText: 'WARN', severityNumber: 13 };
    case 'error':
      return { severityText: 'ERROR', severityNumber: 17 };
    case 'fatal':
      return { severityText: 'FATAL', severityNumber: 21 };
    default:
      return { severityText: 'UNSPECIFIED', severityNumber: 0 };
  }
}

/** Pino configuration that adds OpenTelemetry severity fields understood by CloudWatch Logs. */
export const AWSCloudLoggerConfig = {
  messageKey: 'msg',
  formatters: {
    level(label: string, level: number): object {
      return { level, ...getSeverity(label) };
    },
  },
} satisfies pino.LoggerOptions;
