import { createLogger, type Logger } from '@aztec/aztec.js';

const logLevel = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;
type LogLevel = (typeof logLevel)[number];

export type Log = {
  id: string;
  type: LogLevel;
  timestamp: number;
  prefix: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

export class WebLogger {
  private static instance: WebLogger;
  private logs: Log[] = [];

  private static updateIntervalMs = 1000;
  private static readonly MAX_LOGS_TO_KEEP = 1000;

  public totalLogCount = 0;

  private constructor() {}

  static create(setLogs: (logs: Log[]) => void, setTotalLogCount: (count: number) => void) {
    if (!WebLogger.instance) {
      WebLogger.instance = new WebLogger();
      setInterval(() => {
        const instance = WebLogger.getInstance();
        const newLogs = instance.logs.slice(0, WebLogger.MAX_LOGS_TO_KEEP).sort((a, b) => b.timestamp - a.timestamp);
        setLogs(newLogs);
        setTotalLogCount(instance.totalLogCount);
      }, WebLogger.updateIntervalMs);
    }
  }

  static getInstance() {
    return WebLogger.instance;
  }

  createLogger(prefix: string): Logger {
    return new Proxy(createLogger(prefix), {
      get: (target, prop) => {
        if (logLevel.includes(prop as (typeof logLevel)[number])) {
          return function (this: Logger, ...data: Parameters<Logger[LogLevel]>) {
            const loggingFn = prop as LogLevel;
            const args = [loggingFn, prefix, ...data] as Parameters<WebLogger['handleLog']>;
            WebLogger.getInstance().handleLog(...args);
            target[loggingFn].call(this, ...[data[0], data[1]]);
          };
        } else {
          return target[prop];
        }
      },
    });
  }

  private handleLog(
    type: (typeof logLevel)[number],
    prefix: string,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
  ) {
    this.totalLogCount++;
    this.logs.unshift({ id: this.randomId(), type, prefix, message, data, timestamp: Date.now() });
  }

  private randomId(): string {
    const uint32 = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return uint32.toString(16);
  }
}
