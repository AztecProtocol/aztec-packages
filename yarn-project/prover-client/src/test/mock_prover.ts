import {
  type ProofAndVerificationKey,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobSettledResult,
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
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateBaseRollupInputs,
  type PrivateKernelEmptyInputData,
  type PublicBaseRollupInputs,
  RECURSIVE_PROOF_LENGTH,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  VerificationKeyData,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBlockRootOrBlockMergeRollupPublicInputs,
  makeKernelCircuitPublicInputs,
  makeParityPublicInputs,
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
  ) {
    this.agents = times(agentCount, () => new ProvingAgent(this.broker, proofStore, prover, new NoopTelemetryClient()));
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

  enqueueProvingJob(job: ProvingJob): Promise<void> {
    return this.broker.enqueueProvingJob(job);
  }
  getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    return this.broker.getProvingJobStatus(id);
  }
  removeAndCancelProvingJob(id: ProvingJobId): Promise<void> {
    return this.broker.removeAndCancelProvingJob(id);
  }
  waitForJobToSettle(id: ProvingJobId): Promise<ProvingJobSettledResult> {
    return this.broker.waitForJobToSettle(id);
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
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getPublicBaseRollupProof(
    _inputs: PublicBaseRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getMergeRollupProof(
    _input: MergeRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBaseOrMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockMergeRollupProof(_input: BlockMergeRollupInputs, _signal?: AbortSignal, _epochNumber?: number) {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getEmptyBlockRootRollupProof(
    _input: EmptyBlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getBlockRootRollupProof(
    _input: BlockRootRollupInputs,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeBlockRootOrBlockMergeRollupPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      ),
    );
  }

  getEmptyPrivateKernelProof(
    _inputs: PrivateKernelEmptyInputData,
    _signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    return Promise.resolve(
      makePublicInputsAndRecursiveProof(
        makeKernelCircuitPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
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
      makeProofAndVerificationKey(makeRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFake()),
    );
  }
}
