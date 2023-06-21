import { AztecAddress, EthAddress, Point, Fr } from '@aztec/circuits.js';
import { TxHash } from '@aztec/types';

import { AztecRPC } from '../index.js';
import { createJsonRpcClient } from '@aztec/foundation/json-rpc';

/**
 * Creates an Aztec RPC client implementation, designed to send messages to a remote server.
 * @param baseUrl - The host URL of the JSON RPC server we want to send requests to.
 * @returns A client implementation of the Aztec RPC server.
 */
export function getAztecRpcClient(baseUrl: string) {
  const client = createJsonRpcClient<AztecRPC>(baseUrl, { AztecAddress, TxHash, EthAddress, Point, Fr }, false);
  return client;
}

const client = getAztecRpcClient('http://localhost:8080');
client
  .getBlockNum()
  .then(res => console.log('block num', res))
  .catch(err => console.log(`err: ${err}`));
