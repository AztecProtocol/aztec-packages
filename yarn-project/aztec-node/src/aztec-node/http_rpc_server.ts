import {
  type AztecNode,
  EncryptedL2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  L2Block,
  LogId,
  NullifierMembershipWitness,
  SiblingPath,
  Tx,
  TxEffect,
  TxHash,
  TxReceipt,
  UnencryptedL2BlockL2Logs,
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
    },
    { Tx, TxReceipt, EncryptedL2BlockL2Logs, UnencryptedL2BlockL2Logs, NullifierMembershipWitness },
    // disable methods not part of the AztecNode interface
    ['start', 'stop'],
  );
  return rpc;
}
