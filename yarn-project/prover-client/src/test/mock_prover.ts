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
} from '@aztec/circuit-types';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type AvmCircuitInputs,
  type BaseParityInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type PrivateKernelEmptyInputData,
  type PrivateToRollupKernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  type RootParityInputs,
  TUBE_PROOF_LENGTH,
  VerificationKeyData,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type MergeRollupInputs,
  type PrivateBaseRollupInputs,
  type PublicBaseRollupInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js/rollup';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeParityPublicInputs,
  makePrivateToRollupKernelCircuitPublicInputs,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/testing';
import { times } from '@aztec/foundation/collection';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { InlineProofStore, type ProofStore } from '../proving_broker/proof_store.js';
import { ProvingAgent } from '../proving_broker/proving_agent.js';
import { ProvingBroker } from '../proving_broker/proving_broker.js';
import { InMemoryBrokerDatabase } from '../proving_broker/proving_broker_database/memory.js';

export class TestBroker implements ProvingJobProducer {
  private broker = new ProvingBroker(new InMemoryBrokerDatabase(), new NoopTelemetryClient());
  private agents: ProvingAgent[];

  constructor(
    agentCount: number,
    prover: ServerCircuitProver,
    private proofStore: ProofStore = new InlineProofStore(),
    agentPollInterval = 100,
  ) {
    this.agents = times(
      agentCount,
      () => new ProvingAgent(this.broker, proofStore, prover, new NoopTelemetryClient(), undefined, agentPollInterval),
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

  getAvmProof(_inputs: AvmCircuitInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
        VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
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

  getEmptyPrivateKernelProof(
    _inputs: PrivateKernelEmptyInputData,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<
      PrivateToRollupKernelCircuitPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >
  > {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makePrivateToRollupKernelCircuitPublicInputs(),
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
