import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import {
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobStatus,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityBasePrivateInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
import { makeEmptyRecursiveProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import type {
  BlockMergeRollupPrivateInputs,
  BlockRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
  PrivateTxBaseRollupPrivateInputs,
  PublicTubePrivateInputs,
  PublicTubePublicInputs,
  PublicTxBaseRollupPrivateInputs,
  RootRollupPrivateInputs,
  RootRollupPublicInputs,
  TxMergeRollupPrivateInputs,
  TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import {
  makeBlockRollupPublicInputs,
  makeCheckpointRollupPublicInputs,
  makeParityPublicInputs,
  makePublicTubePublicInputs,
  makeRootRollupPublicInputs,
  makeTxRollupPublicInputs,
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

  getBaseParityProof(_inputs: ParityBasePrivateInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getRootParityProof(_inputs: ParityRootPrivateInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPublicTubeProof(
    _inputs: PublicTubePrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makePublicTubePublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getPrivateTxBaseRollupProof(
    _baseRollupInput: PrivateTxBaseRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeTxRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getPublicTxBaseRollupProof(
    _inputs: PublicTxBaseRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeTxRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getTxMergeRollupProof(
    _input: TxMergeRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeTxRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockRootFirstRollupProof(
    _input: BlockRootFirstRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockRootSingleTxFirstRollupProof(
    _input: BlockRootSingleTxFirstRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockRootEmptyTxFirstRollupProof(
    _input: BlockRootEmptyTxFirstRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockRootRollupProof(
    _input: BlockRootRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getBlockRootSingleTxRollupProof(
    _input: BlockRootSingleTxRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockMergeRollupProof(_input: BlockMergeRollupPrivateInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getCheckpointRootRollupProof(
    _input: CheckpointRootRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeCheckpointRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getCheckpointRootSingleBlockRollupProof(
    _input: CheckpointRootSingleBlockRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeCheckpointRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getCheckpointMergeRollupProof(
    _input: CheckpointMergeRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeCheckpointRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getCheckpointPaddingRollupProof(
    _input: CheckpointPaddingRollupPrivateInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeCheckpointRollupPublicInputs(),
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyData.makeFakeRollupHonk(),
      ),
    );
  }

  getRootRollupProof(
    _input: RootRollupPrivateInputs,
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
}
