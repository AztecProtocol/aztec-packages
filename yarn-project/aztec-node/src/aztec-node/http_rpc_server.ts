import {
  type AztecNode,
  EncryptedL2NoteLog,
  EncryptedNoteL2BlockL2Logs,
  EpochProofQuote,
  ExtendedUnencryptedL2Log,
  L2Block,
  LogId,
  NullifierMembershipWitness,
  PublicDataWitness,
  PublicSimulationOutput,
  SiblingPath,
  Tx,
  TxEffect,
  TxHash,
  TxReceipt,
  UnencryptedL2BlockL2Logs,
} from '@aztec/circuit-types';
import { FunctionSelector, Header, PublicKeys } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Buffer32 } from '@aztec/foundation/buffer';
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
      Buffer32,
      PublicDataWitness,
      PublicKeys,
      SiblingPath,
    },
    {
      EncryptedNoteL2BlockL2Logs,
      EncryptedL2NoteLog,
      NoteSelector,
      NullifierMembershipWitness,
      PublicSimulationOutput,
      Tx,
      TxReceipt,
      UnencryptedL2BlockL2Logs,
      EpochProofQuote,
    },
    // disable methods not part of the AztecNode interface
    ['start', 'stop'],
  );
  return rpc;
}
