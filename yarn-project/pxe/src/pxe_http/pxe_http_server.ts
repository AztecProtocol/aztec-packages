import {
  AuthWitness,
  CompleteAddress,
  CountedNoteLog,
  CountedPublicExecutionRequest,
  EncryptedL2Log,
  EncryptedL2NoteLog,
  EncryptedNoteL2BlockL2Logs,
  EventMetadata,
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
import { FunctionSelector, PrivateCircuitPublicInputs, PublicKeys } from '@aztec/circuits.js';
import { EventSelector, NoteSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { JsonRpcServer, createNamespacedJsonRpcServer } from '@aztec/foundation/json-rpc/server';

import http from 'http';

/**
 * Wraps an instance of Private eXecution Environment (PXE) implementation to a JSON RPC HTTP interface.
 * @returns A new instance of the HTTP server.
 */
export function createPXERpcServer(pxeService: PXE): JsonRpcServer {
  return new JsonRpcServer(
    pxeService,
    {
      AuthWitness,
      AztecAddress,
      Buffer32,
      CompleteAddress,
      EthAddress,
      EventSelector,
      ExtendedNote,
      ExtendedUnencryptedL2Log,
      Fr,
      FunctionSelector,
      GrumpkinScalar,
      L2Block,
      LogId,
      Note,
      Point,
      PublicKeys,
      SiblingPath,
      TxEffect,
      TxExecutionRequest,
      TxHash,
      UniqueNote,
    },
    {
      CountedPublicExecutionRequest,
      CountedNoteLog,
      EncryptedL2Log,
      EncryptedL2NoteLog,
      EncryptedNoteL2BlockL2Logs,
      EventMetadata,
      NoteSelector,
      NullifierMembershipWitness,
      PrivateCircuitPublicInputs,
      PrivateExecutionResult,
      TxSimulationResult,
      TxProvingResult,
      Tx,
      TxReceipt,
      UnencryptedL2BlockL2Logs,
      UnencryptedL2Log,
    },
    ['start', 'stop'],
  );
}

/**
 * Creates an http server that forwards calls to the PXE and starts it on the given port.
 * @param pxeService - PXE that answers queries to the created HTTP server.
 * @param port - Port to listen in.
 * @returns A running http server.
 */
export function startPXEHttpServer(pxeService: PXE, port: string | number): http.Server {
  const pxeServer = createPXERpcServer(pxeService);
  const rpcServer = createNamespacedJsonRpcServer([{ pxe: pxeServer }]);

  const app = rpcServer.getApp();
  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  return httpServer;
}
