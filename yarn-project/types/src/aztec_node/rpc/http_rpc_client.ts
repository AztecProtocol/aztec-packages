import { FunctionSelector, HistoricBlockData } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';
import {
  AztecNode,
  ContractData,
  ExtendedContractData,
  ExtendedUnencryptedL2Log,
  L1ToL2MessageAndIndex,
  L2Block,
  L2BlockL2Logs,
  L2Tx,
  LogId,
  SiblingPath,
  Tx,
  TxHash,
} from '@aztec/types';

/**
 * Creates a JSON-RPC client to remotely talk to an AztecNode.
 * @param url - The URL of the AztecNode
 * @param fetch - The fetch implementation to use
 * @returns A JSON-RPC client
 */
export function createAztecNodeRpcClient(url: string, fetch = defaultFetch): AztecNode {
  const rpcClient = createJsonRpcClient<AztecNode>(
    url,
    {
      AztecAddress,
      EthAddress,
      ExtendedContractData,
      ExtendedUnencryptedL2Log,
      ContractData,
      Fr,
      FunctionSelector,
      HistoricBlockData,
      L2Block,
      L2Tx,
      LogId,
      TxHash,
      SiblingPath,
      L1ToL2MessageAndIndex,
    },
    { Tx, L2BlockL2Logs },
    false,
    fetch,
  );
  return rpcClient;
}
