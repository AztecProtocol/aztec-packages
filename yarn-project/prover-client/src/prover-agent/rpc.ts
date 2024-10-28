import { type ProvingJobSource } from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  AztecAddress,
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  EthAddress,
  Fr,
  Header,
  KernelCircuitPublicInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  PrivateBaseRollupInputs,
  PrivateKernelEmptyInputData,
  Proof,
  PublicBaseRollupInputs,
  PublicKernelCircuitPublicInputs,
  RecursiveProof,
  RootParityInput,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  TubeInputs,
  VMCircuitPublicInputs,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { createJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';

import { type ProverAgent } from './prover-agent.js';
import { ProvingError } from './proving-error.js';

export function createProvingJobSourceServer(queue: ProvingJobSource): JsonRpcServer {
  return new JsonRpcServer(
    queue,
    {
      AvmCircuitInputs,
      BaseOrMergeRollupPublicInputs,
      BaseParityInputs,
      PrivateBaseRollupInputs,
      PublicBaseRollupInputs,
      Fr,
      Header,
      KernelCircuitPublicInputs,
      MergeRollupInputs,
      ParityPublicInputs,
      Proof,
      ProvingError,
      PrivateKernelEmptyInputData,
      VMCircuitPublicInputs,
      PublicKernelCircuitPublicInputs,
      RecursiveProof,
      RootParityInput,
      RootParityInputs,
      RootRollupInputs,
      RootRollupPublicInputs,
      TubeInputs,
      VerificationKeyData,
      BlockRootOrBlockMergePublicInputs,
      BlockMergeRollupInputs,
      BlockRootRollupInputs,
      EmptyBlockRootRollupInputs,
    },
    {},
  );
}

export function createProvingJobSourceClient(
  url: string,
  namespace?: string,
  fetch = makeFetch([1, 2, 3], false),
): ProvingJobSource {
  return createJsonRpcClient(
    url,
    {
      AvmCircuitInputs,
      BaseOrMergeRollupPublicInputs,
      BaseParityInputs,
      PrivateBaseRollupInputs,
      PublicBaseRollupInputs,
      Fr,
      Header,
      KernelCircuitPublicInputs,
      MergeRollupInputs,
      ParityPublicInputs,
      Proof,
      ProvingError,
      PrivateKernelEmptyInputData,
      VMCircuitPublicInputs,
      PublicKernelCircuitPublicInputs,
      RecursiveProof,
      RootParityInput,
      RootParityInputs,
      RootRollupPublicInputs,
      RootRollupInputs,
      TubeInputs,
      VerificationKeyData,
      BlockRootOrBlockMergePublicInputs,
      BlockMergeRollupInputs,
      BlockRootRollupInputs,
      EmptyBlockRootRollupInputs,
    },
    {},
    false,
    namespace,
    fetch,
  ) as ProvingJobSource;
}

/**
 * Wrap a ProverAgent instance with a JSON RPC HTTP server.
 * @param node - The ProverNode
 * @returns An JSON-RPC HTTP server
 */
export function createProverAgentRpcServer(agent: ProverAgent) {
  const rpc = new JsonRpcServer(
    agent,
    {
      AztecAddress,
      EthAddress,
      Fr,
      Header,
    },
    {},
    // disable methods
    ['start', 'stop', 'setCircuitProver', 'work', 'getProof'],
  );
  return rpc;
}
