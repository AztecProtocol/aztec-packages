import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { retryUntil } from '@aztec/foundation/retry';

import { createPXEClient } from '../rpc_clients/pxe_client.js';

export const getL1ContractAddresses = async (url: string): Promise<L1ContractAddresses> => {
  const pxeClient = createPXEClient(url, {});
  const response = await retryUntil(
    async () => {
      try {
        return (await pxeClient.getNodeInfo()).l1ContractAddresses;
      } catch {
        // do nothing
      }
    },
    'isNodeReady',
    120,
    1,
  );
  return response;
};
