import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import {
  type ProofAndVerificationKey,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobStatus,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { BaseParityInputs, RootParityInputs } from '@aztec/stdlib/parity';
import { makeEmptyRecursiveProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import type {
  BaseOrMergeRollupPublicInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PaddingBlockRootRollupInputs,
  PrivateBaseRollupInputs,
  PublicBaseRollupInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  SingleTxBlockRootRollupInputs,
} from '@aztec/stdlib/rollup';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeParityPublicInputs,
  makeRootRollupPublicInputs,
} from '@aztec/stdlib/testing';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { InlineProofStore, type ProofStore } from '../proving_broker/proof_store/index.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';
import { ProvingBroker } from '../proving_broker/proving_broker.js';
import { InMemoryBrokerDatabase } from '../proving_broker/proving_broker_database/memory.js';

export class TestBroker implements ProvingJobProducer {
  private broker: ProvingBroker;
  private agents: ProvingAgent[];

  constructor(
    agentCount: number,
    prover: ServerCircuitProver,
    private proofStore: ProofStore = new InlineProofStore(),
    agentPollInterval = 100,
  ) {
    this.broker = new ProvingBroker(new InMemoryBrokerDatabase());
    this.agents = times(
      agentCount,
      () => new ProvingAgent(this.broker, proofStore, prover, undefined, agentPollInterval),
    );
  }

  public async start() {
    await this.broker.start();
    this.agents.forEach(agent => agent.start());
  }

  public async stop() {
    await Promise.all(this.agents.map(agent => agent.stop()));
    await this.broker.stop();
  }

  public getProofStore(): ProofStore {
    return this.proofStore;
  }

  enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus> {
    return this.broker.enqueueProvingJob(job);
  }
  getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    return this.broker.getProvingJobStatus(id);
  }
  cancelProvingJob(id: string): Promise<void> {
    return this.broker.cancelProvingJob(id);
  }

  getCompletedJobs(ids: ProvingJobId[]): Promise<ProvingJobId[]> {
    return this.broker.getCompletedJobs(ids);
  }
}

export class MockProver implements ServerCircuitProver {
  constructor() {}

  getAvmProof(
    _inputs: AvmCircuitInputs,
    _skipPublicInputsValidation?: boolean, // TODO(#14234)[Unconditional PIs validation]: Remove.
    _signal?: AbortSignal,
    _epochNumber?: number,
  ) {
    return Promise.resolve(
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED),
        VerificationKeyData.makeFake(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
      ),
    );
  }

  getBaseParityProof(_inputs: BaseParityInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getRootParityProof(_inputs: RootParityInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPrivateBaseRollupProof(
    _baseRollupInput: PrivateBaseRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getPublicBaseRollupProof(
    _inputs: PublicBaseRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getMergeRollupProof(
    _input: MergeRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockMergeRollupProof(_input: BlockMergeRollupInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getEmptyBlockRootRollupProof(
    _input: EmptyBlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getPaddingBlockRootRollupProof(
    _input: PaddingBlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockRootRollupProof(
    _input: BlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getSingleTxBlockRootRollupProof(
    _input: SingleTxBlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getRootRollupProof(
    _input: RootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeRootRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getTubeProof(): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return Promise.resolve(
      makeProofAndVerificationKey(makeRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFakeRollupHonk()),
    );
  }
}
