import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import type { PXE } from '@aztec/stdlib/interfaces/client';

/**
 * Waits for the PXE (Private Execution Environment) to become responsive
 * by polling `getNodeInfo` until it succeeds, or until timeout / retry limits are reached.
 *
 * @param pxe - The PXE client instance to wait for.
 * @param logger - Optional logger instance for verbose output.
 * @param options - Optional configuration.
 * @param options.timeoutMs - Max total wait time in milliseconds. Default is 10 seconds.
 * @param options.maxRetries - Max number of retry attempts. Default is unlimited.
 * @param options.retryIntervalMs - Time to wait between retries, in milliseconds. Default is 1 second.
 *
 * @throws Will throw an error if the timeout or retry limit is exceeded.
 */
export const waitForPXE = async (
  pxe: PXE,
  logger?: Logger,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryIntervalMs?: number;
  },
): Promise<void> => {
  const {
    timeoutMs = 10_000,
    maxRetries = Infinity,
    retryIntervalMs = 1000,
  } = options ?? {};

  const startTime = Date.now();
  let attempt = 0;

  await retryUntil(async () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for PXE`);
    }

    if (attempt >= maxRetries) {
      throw new Error(`Exceeded ${maxRetries} attempts while waiting for PXE`);
    }

    attempt++;

    try {
      logger?.verbose('Attempting to contact PXE...');
      await pxe.getNodeInfo();
      logger?.verbose('Contacted PXE');
      return true;
    } catch (error) {
      logger?.verbose('Failed to contact PXE');
      return undefined;
    }
  }, 'RPC Get Node Info', retryIntervalMs,);
};
