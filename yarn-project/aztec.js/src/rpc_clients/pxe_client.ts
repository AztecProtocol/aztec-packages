import {
  AuthWitness,
  EncryptedNoteL2BlockL2Logs,
  ExtendedNote,
  ExtendedUnencryptedL2Log,
  L2Block,
  LogId,
  Note,
  NullifierMembershipWitness,
  type PXE,
  SimulatedTx,
  Tx,
  TxEffect,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  UnencryptedL2BlockL2Logs,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  GrumpkinScalar,
  Point,
} from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { createJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { type DebugLogger } from '@aztec/foundation/log';
import { NoRetryError } from '@aztec/foundation/retry';

import axios, { type AxiosError, type AxiosResponse } from 'axios';

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
      ExtendedUnencryptedL2Log,
      Fr,
      GrumpkinScalar,
      L2Block,
      TxEffect,
      LogId,
      Note,
      Point,
      TxExecutionRequest,
      TxHash,
    },
    {
      EncryptedNoteL2BlockL2Logs,
      NoteSelector,
      NullifierMembershipWitness,
      SimulatedTx,
      Tx,
      TxReceipt,
      UnencryptedL2BlockL2Logs,
    },
    false,
    'pxe',
    fetch,
  ) as PXE;

/**
 * A fetch implementation using axios.
 * @param host - The URL of the host.
 * @param rpcMethod - The RPC method to call.
 * @param body - The body of the request.
 * @param useApiEndpoints - Whether to use the API endpoints or inject the method in the body.
 * @param _noRetry - Whether to retry on non-server errors.
 * @returns The response data.
 */
async function axiosFetch(host: string, rpcMethod: string, body: any, useApiEndpoints: boolean, _noRetry = true) {
  let resp: AxiosResponse;
  if (useApiEndpoints) {
    resp = await axios
      .post(`${host}/${rpcMethod}`, body, {
        headers: { 'content-type': 'application/json' },
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          return error.response;
        }
        throw error;
      });
  } else {
    resp = await axios
      .post(
        host,
        { ...body, method: rpcMethod },
        {
          headers: { 'content-type': 'application/json' },
        },
      )
      .catch((error: AxiosError) => {
        if (error.response) {
          return error.response;
        }
        throw error;
      });
  }

  const isOK = resp.status >= 200 && resp.status < 300;
  if (isOK) {
    return resp.data;
  } else if (resp.status >= 400 && resp.status < 500) {
    throw new NoRetryError('(JSON-RPC PROPAGATED) ' + resp.data.error.message);
  } else {
    throw new Error('(JSON-RPC PROPAGATED) ' + resp.data.error.message);
  }
}

/**
 * Creates a PXE client with a given set of retries on non-server errors.
 * Checks that PXE matches the expected version, and warns if not.
 * @param rpcUrl - URL of the RPC server wrapping the PXE.
 * @param _logger - Debug logger to warn version incompatibilities.
 * @returns A PXE client.
 */
export function createCompatibleClient(rpcUrl: string, _logger: DebugLogger): Promise<PXE> {
  // Use axios due to timeout issues with fetch when proving TXs.
  const pxe = createPXEClient(rpcUrl, axiosFetch);
  return Promise.resolve(pxe);
}
