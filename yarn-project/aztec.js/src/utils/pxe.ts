import { type PXE } from '@aztec/circuit-types';
import { type Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

export const waitForPXE = async (pxe: PXE, logger?: Logger) => {
  await retryUntil(async () => {
    try {
      logger?.verbose('Attempting to contact PXE...');
      await pxe.getNodeInfo();
      logger?.verbose('Contacted PXE');
      return true;
    } catch (error) {
      logger?.verbose('Failed to contact PXE');
    }
    return undefined;
  }, 'RPC Get Node Info');
};
