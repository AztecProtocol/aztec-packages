import { type TxProvider, createAztecNodeClient } from '@aztec/circuit-types';

import { AztecNodeTxProvider } from './aztec-node-tx-provider.js';
import { type TxProviderConfig } from './config.js';

export function createTxProvider(config: TxProviderConfig): TxProvider {
  if (config.txProviderNodeUrl) {
    const node = createAztecNodeClient(config.txProviderNodeUrl);
    return new AztecNodeTxProvider(node);
  } else {
    throw new Error(`Tx provider node URL is not set`);
  }
}
