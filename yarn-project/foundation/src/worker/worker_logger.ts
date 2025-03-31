import { type DispatchMsg, TransportServer } from '../transport/index.js';

/**
 * A logger implementation that forwards log messages via a transport server.
 * The logger maintains a fixed trace level and always enables logging.
 */

export class WorkerLogger {
  constructor(private transportServer: TransportServer<DispatchMsg>) {}

  silent = () => {};
  fatal = (msg: string, err?: unknown, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'fatal', msg, err, data] });
  error = (msg: string, err?: unknown, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'error', msg, err, data] });
  warn = (msg: string, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'warn', msg, data] });
  info = (msg: string, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'info', msg, data] });
  verbose = (msg: string, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'verbose', msg, data] });
  debug = (msg: string, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'debug', msg, data] });
  trace = (msg: string, data?: unknown) =>
    this.transportServer.broadcast({ fn: 'emit', args: ['log', 'trace', msg, data] });

  readonly level = 'trace' as const;
  readonly isLevelEnabled = () => true;
  readonly module = 'web-worker';
}
