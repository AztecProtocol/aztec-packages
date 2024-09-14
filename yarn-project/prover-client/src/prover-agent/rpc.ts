import { type ProvingJobSource } from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  AvmVerificationKeyData,
  AztecAddress,
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EthAddress,
  Fr,
  Header,
  KernelCircuitPublicInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  PrivateKernelEmptyInputData,
  Proof,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelInnerCircuitPrivateInputs,
  PublicKernelTailCircuitPrivateInputs,
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
      AvmVerificationKeyData,
      AvmCircuitInputs,
      BaseOrMergeRollupPublicInputs,
      BaseParityInputs,
      BaseRollupInputs,
      Fr,
      Header,
      KernelCircuitPublicInputs,
      MergeRollupInputs,
      ParityPublicInputs,
      Proof,
      ProvingError,
      PrivateKernelEmptyInputData,
      VMCircuitPublicInputs,
      PublicKernelInnerCircuitPrivateInputs,
      PublicKernelCircuitPrivateInputs,
      PublicKernelCircuitPublicInputs,
      PublicKernelTailCircuitPrivateInputs,
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
      AvmVerificationKeyData,
      AvmCircuitInputs,
      BaseOrMergeRollupPublicInputs,
      BaseParityInputs,
      BaseRollupInputs,
      Fr,
      Header,
      KernelCircuitPublicInputs,
      MergeRollupInputs,
      ParityPublicInputs,
      Proof,
      ProvingError,
      PrivateKernelEmptyInputData,
      VMCircuitPublicInputs,
      PublicKernelInnerCircuitPrivateInputs,
      PublicKernelCircuitPrivateInputs,
      PublicKernelCircuitPublicInputs,
      PublicKernelTailCircuitPrivateInputs,
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
