import {
  AuthWitness,
  CountedNoteLog,
  CountedPublicExecutionRequest,
  EncryptedL2Log,
  EncryptedL2NoteLog,
  EncryptedNoteL2BlockL2Logs,
  ExtendedNote,
  ExtendedUnencryptedL2Log,
  L2Block,
  LogId,
  Note,
  NullifierMembershipWitness,
  type PXE,
  PrivateExecutionResult,
  SiblingPath,
  Tx,
  TxEffect,
  TxExecutionRequest,
  TxHash,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UnencryptedL2BlockL2Logs,
  UnencryptedL2Log,
  UniqueNote,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  GrumpkinScalar,
  Point,
  PrivateCircuitPublicInputs,
  PublicKeys,
} from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { Buffer32 } from '@aztec/foundation/buffer';
import { createJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';

/**
 * Creates a JSON-RPC client to remotely talk to PXE.
 * @param url - The URL of the PXE.
 * @param fetch - The fetch implementation to use.
 * @returns A JSON-RPC client of PXE.
 */
export const createPXEClient = (url: string, fetch = makeFetch([1, 2, 3], false)): PXE =>
  createJsonRpcClient<PXE>(
    url,
    {
      AuthWitness,
      AztecAddress,
      CompleteAddress,
      FunctionSelector,
      EthAddress,
      ExtendedNote,
      UniqueNote,
      ExtendedUnencryptedL2Log,
      Fr,
      GrumpkinScalar,
      L2Block,
      TxEffect,
      LogId,
      Note,
      Point,
      PublicKeys,
      TxExecutionRequest,
      TxHash,
      Buffer32,
      SiblingPath,
    },
    {
      EncryptedNoteL2BlockL2Logs,
      EncryptedL2NoteLog,
      EncryptedL2Log,
      UnencryptedL2Log,
      NoteSelector,
      NullifierMembershipWitness,
      TxSimulationResult,
      TxProvingResult,
      PrivateCircuitPublicInputs,
      PrivateExecutionResult,
      CountedPublicExecutionRequest,
      CountedNoteLog,
      Tx,
      TxReceipt,
      UnencryptedL2BlockL2Logs,
    },
    false,
    'pxe',
    fetch,
  ) as PXE;
