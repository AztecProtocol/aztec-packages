import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

/** Represents a local service that can be started and stopped. */
export interface Service {
  /**
   * Starts the service.
   * @param waitUntilSynced - Whether to wait until the service is fully synched before returning.
   */
  start(waitUntilSynced?: boolean): Promise<void>;

  /** Stops the service. */
  stop(): Promise<void>;

  /** Resumes the service after it was stopped */
  resume(): void;
}

/**
 * Tries to call stop on a given object and awaits it. Logs any errors and does not rethrow.
 * If `timeoutMs` is provided, the call returns at most after that many milliseconds and logs an
 * error if the service did not stop in time — useful when one service can hang indefinitely (e.g.
 * waiting on an unresponsive L1 publish) and would otherwise block a shared teardown loop.
 */
export async function tryStop(service?: any, logger?: Logger, timeoutMs?: number): Promise<void> {
  const stop = async () => {
    try {
      if (typeof service === 'object' && service && 'stop' in service && typeof service.stop === 'function') {
        await service.stop();
      }
    } catch (err) {
      logger?.error(`Error stopping service ${(service as object).constructor?.name}: ${err}`);
    }
  };

  if (timeoutMs === undefined) {
    await stop();
    return;
  }

  await Promise.race([
    stop(),
    sleep(timeoutMs).then(() => {
      const name = (service as object | undefined)?.constructor?.name ?? 'unknown';
      logger?.error(`Service ${name} stop did not return within ${timeoutMs}ms; abandoning`);
    }),
  ]);
}
