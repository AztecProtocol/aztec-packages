import { AsyncLocalStorage } from 'node:async_hooks';

import { type LoggerBindings, addLogBindingsHandler, removeLogBindingsHandler } from './pino-logger.js';

/** AsyncLocalStorage for logger bindings context propagation (Node.js only). */
const bindingsStorage = new AsyncLocalStorage<LoggerBindings>();

/** Returns the current bindings from AsyncLocalStorage, if any. */
export function getBindings(): LoggerBindings | undefined {
  return bindingsStorage.getStore();
}

/**
 * Runs a callback within a bindings context. All loggers created within the callback
 * will automatically inherit the bindings (actor, instanceId) via the log bindings handler.
 */
export async function withLoggerBindings<T>(bindings: LoggerBindings, callback: () => Promise<T>): Promise<T> {
  const handler = () => bindingsStorage.getStore();
  addLogBindingsHandler(handler);
  try {
    return await bindingsStorage.run(bindings, callback);
  } finally {
    removeLogBindingsHandler(handler);
  }
}
