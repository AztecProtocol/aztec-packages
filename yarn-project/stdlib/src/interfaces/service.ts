import type { Logger } from '@aztec/foundation/log';
import type { Maybe } from '@aztec/foundation/types';

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

/** Tries to call stop on a given object and awaits it. Logs any errors and does not rethrow. */
export async function tryStop(service: Maybe<Service>, logger?: Logger): Promise<void> {
  try {
    return typeof service === 'object' && service && 'stop' in service && typeof service.stop === 'function'
      ? await service.stop()
      : Promise.resolve();
  } catch (err) {
    logger?.error(`Error stopping service ${(service as object).constructor?.name}: ${err}`);
  }
}

export function tryRestart(service: Maybe<Service>, logger?: Logger) {
  try {
    return typeof service === 'object' && service && 'restart' in service && typeof service.restart === 'function'
      ? service.restart()
      : Promise.resolve();
  } catch (err) {
    logger?.error(`Error restarting service ${(service as object).constructor?.name}: ${err}`);
  }
}
