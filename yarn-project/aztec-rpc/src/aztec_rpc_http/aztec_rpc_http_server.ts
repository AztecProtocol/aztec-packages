import { foundry } from 'viem/chains';
import { Tx, TxHash } from '@aztec/types';
import { JsonRpcServer } from '@aztec/foundation/json-rpc';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { CombinedAccumulatedData, PrivateHistoricTreeRoots } from '@aztec/circuits.js';

import { EthAddress, createAztecRPCServer } from '../index.js';

export const localAnvil = foundry;

/**
 * Wraps an instance of the Aztec RPC Server implementation to a JSON RPC HTTP interface.
 * @returns A new instance of the HTTP server.
 */
export async function getHttpRpcServer(nodeConfig: AztecNodeConfig): Promise<JsonRpcServer> {
  const aztecNode = await AztecNodeService.createAndSync(nodeConfig);
  const aztecRpcServer = await createAztecRPCServer(aztecNode);
  const generatedRpcServer = new JsonRpcServer(
    aztecRpcServer,
    {
      AztecAddress,
      TxHash,
      EthAddress,
      Point,
      Fr,
    },
    { Tx },
    false,
    ['start', 'stop'],
  );
  return generatedRpcServer;
}
