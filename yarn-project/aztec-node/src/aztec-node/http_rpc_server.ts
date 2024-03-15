import {
  AztecNode,
  ExtendedUnencryptedL2Log,
  L1ToL2MessageAndIndex,
  L2Block,
  L2BlockL2Logs,
  LogId,
  NullifierMembershipWitness,
  SiblingPath,
  Tx,
  TxEffect,
  TxHash,
  TxReceipt,
} from '@aztec/circuit-types';
import { FunctionSelector, Header } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';

/**
 * Wrap an AztecNode instance with a JSON RPC HTTP server.
 * @param node - The AztecNode
 * @returns An JSON-RPC HTTP server
 */
export function createAztecNodeRpcServer(node: AztecNode) {
  const rpc = new JsonRpcServer(
    node,
    {
      AztecAddress,
      EthAddress,
      ExtendedUnencryptedL2Log,
      Fr,
      FunctionSelector,
      Header,
      L2Block,
      TxEffect,
      LogId,
      TxHash,
      SiblingPath,
      L1ToL2MessageAndIndex,
    },
    { Tx, TxReceipt, L2BlockL2Logs, NullifierMembershipWitness },
    // disable methods not part of the AztecNode interface
    ['start', 'stop'],
  );
  return rpc;
}
