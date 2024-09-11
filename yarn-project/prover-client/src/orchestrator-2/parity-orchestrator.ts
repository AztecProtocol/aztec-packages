import { MerkleTreeId } from '@aztec/circuit-types';
import {
  BaseParityInputs,
  Fr,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  type RootParityInput,
} from '@aztec/circuits.js';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type Tuple } from '@aztec/foundation/serialize';

import { getSubtreeSiblingPath, getTreeSnapshot } from '../orchestrator/block-building-helpers.js';
import { BaseParityCircuit } from './circuits/base-parity.js';
import { RootParityCircuit } from './circuits/root-parity.js';
import { type OrchestratorContext } from './types.js';

export class ParityOrchestrator {
  private baseParityJobs?: BaseParityCircuit[];
  private rootParityJob?: RootParityCircuit;

  private simulationPromise = promiseWithResolvers<ParityPublicInputs>();
  private proofPromise = promiseWithResolvers<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>>();

  constructor(private readonly unpaddedl1ToL2Messages: Fr[], private readonly context: OrchestratorContext) {
    this.handleError = this.handleError.bind(this);
  }

  @memoize
  public async updateState() {
    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.context.db);

    const newL1ToL2MessageTreeRootSiblingPath = padArrayEnd(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, this.context.db),
      Fr.ZERO,
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    );

    // Update the local trees to include the new l1 to l2 messages
    await this.context.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.l1ToL2Messages);

    return {
      l1ToL2Messages: this.l1ToL2Messages,
      messageTreeSnapshot,
      newL1ToL2MessageTreeRootSiblingPath,
    };
  }

  @memoize
  public simulate() {
    this.start();
    return this.simulationPromise.promise;
  }

  @memoize
  public prove() {
    this.start();
    return this.proofPromise.promise;
  }

  private get l1ToL2Messages() {
    return padArrayEnd(
      this.unpaddedl1ToL2Messages,
      Fr.ZERO,
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      'Too many L1 to L2 messages',
    );
  }

  @memoize
  private start() {
    const rootParityJob = this.createRootParityProvingJob();
    this.rootParityJob = rootParityJob;

    const count = NUM_BASE_PARITY_PER_ROOT_PARITY;
    const messageBatches = times(count, i => BaseParityInputs.sliceMessages(this.l1ToL2Messages, i));

    this.baseParityJobs = messageBatches.map((messages, index) => {
      return this.createBaseParityProvingJob(messages, index, rootParityJob);
    });
  }

  private createBaseParityProvingJob(
    messages: Tuple<Fr, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    index: number,
    rootParityJob: RootParityCircuit,
  ) {
    const job = new BaseParityCircuit(messages, index, this.context);
    void job
      .simulate()
      .then(simulation => rootParityJob.setNestedSimulation(simulation, index))
      .catch(this.handleError);

    if (!this.context.options.simulationOnly) {
      void job
        .prove()
        .then(proof => rootParityJob.setNestedProof(proof, index))
        .catch(this.handleError);
    }

    return job;
  }

  private createRootParityProvingJob() {
    const rootParityJob = new RootParityCircuit(this.context);

    void rootParityJob
      .simulate()
      .then(simulation => this.simulationPromise.resolve(simulation))
      .catch(this.handleError);

    if (!this.context.options.simulationOnly) {
      void rootParityJob
        .prove()
        .then(proof => this.proofPromise.resolve(proof))
        .catch(this.handleError);
    }

    return rootParityJob;
  }

  private handleError(err: Error) {
    throw err; // TODO: proper error handling
  }
}
