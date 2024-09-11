import { MerkleTreeId, ProvingRequestType, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import {
  type ARCHIVE_HEIGHT,
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  type Fr,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type ParityPublicInputs,
  PreviousRollupData,
  RootParityInput,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { memoize } from '@aztec/foundation/decorators';
import { type LogData, createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type Tuple, awaitTuple, mapTuple } from '@aztec/foundation/serialize';
import { getVKMembershipWitness } from '@aztec/noir-protocol-circuits-types';

import { getRootTreeSiblingPath, getTreeSnapshot } from '../../orchestrator/block-building-helpers.js';
import { type Circuit, type OrchestratorContext, type ParityState } from '../types.js';

/**
 * Handles the block root circuit. This circuit is responsible for proving the root of the block.
 * Requires inputs from root parity, two child merge circuits, and a snapshot of the archive tree.
 */
export class BlockRootCircuit implements Circuit<ProvingRequestType.BLOCK_ROOT_ROLLUP> {
  private readonly simulationInputs = makeTuple(2, () => promiseWithResolvers<BaseOrMergeRollupPublicInputs>());
  private readonly provingInputs = makeTuple(2, () =>
    promiseWithResolvers<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>>(),
  );

  private readonly rootParitySimulationInput = promiseWithResolvers<ParityPublicInputs>();
  private readonly rootParityProvingInput =
    promiseWithResolvers<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>>();
  private readonly rootParityStateInput = promiseWithResolvers<ParityState>();

  private readonly archiveSnapshot = promiseWithResolvers<{
    startArchiveSnapshot: AppendOnlyTreeSnapshot;
    newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
    previousBlockHash: Fr;
  }>();

  private readonly logger = createDebugLogger('aztec:prover-client:block-root-circuit');
  private readonly logdata: LogData;

  constructor(public readonly blockNumber: number, private context: OrchestratorContext) {
    this.logdata = { blockNumber };
  }

  public getSimulationInputs() {
    return Promise.all([
      this.simulationInputs[0].promise,
      this.simulationInputs[1].promise,
      this.rootParitySimulationInput.promise,
    ] as const);
  }

  public setNestedSimulation(simulation: BaseOrMergeRollupPublicInputs, index: number) {
    this.logger.debug(`Setting nested simulation for index ${index}`, this.logdata);
    this.checkIndex(index);
    this.simulationInputs[index].resolve(simulation);
  }

  public setNestedProof(proof: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>, index: number) {
    this.logger.debug(`Setting nested proof for index ${index}`, this.logdata);
    this.checkIndex(index);
    this.provingInputs[index].resolve(proof);
  }

  private checkIndex(index: number) {
    if (index > 1) {
      throw new Error('Invalid child merge index.');
    }
  }

  public setRootParitySimulation(input: ParityPublicInputs) {
    this.logger.debug(`Setting root parity simulation`, this.logdata);
    this.rootParitySimulationInput.resolve(input);
  }

  public setRootParityProof(input: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>) {
    this.logger.debug(`Setting root parity proof`, this.logdata);
    this.rootParityProvingInput.resolve(input);
  }

  public setRootParityState(input: ParityState) {
    this.logger.debug(`Setting root parity state`, this.logdata);
    this.rootParityStateInput.resolve(input);
  }

  public async makeArchiveSnapshot() {
    this.logger.debug(`Acquiring archive snapshot`, this.logdata);
    const db = this.context.db;

    // Take a snapshot of the archive tree before this block is added to it
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, db);

    // Get the previous block hash as the last leaf on the archive tree
    const previousBlockHash = await db.getLeafValue(
      MerkleTreeId.ARCHIVE,
      BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1),
    );
    if (!previousBlockHash) {
      throw new Error(`Previous block hash not found for block ${this.blockNumber}`);
    }

    this.logger.debug(`Acquired archive snapshot`, {
      ...this.logdata,
      size: startArchiveSnapshot.nextAvailableLeafIndex,
      previousBlockHash: previousBlockHash?.toString(),
    });

    this.archiveSnapshot.resolve({ startArchiveSnapshot, newArchiveSiblingPath, previousBlockHash });
  }

  @memoize
  private async buildSimulationInputs() {
    this.logger.debug(`Awaiting root parity simulation inputs`, this.logdata);
    const [rootParityInput, rootParityState] = await Promise.all([
      this.rootParitySimulationInput.promise,
      this.rootParityStateInput.promise,
    ] as const);

    const {
      l1ToL2Messages: newL1ToL2Messages,
      messageTreeSnapshot: startL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageTreeRootSiblingPath,
    } = rootParityState;

    this.logger.debug(`Awaiting merge simulation inputs`, this.logdata);
    const previousRollupData: BlockRootRollupInputs['previousRollupData'] = await awaitTuple(
      mapTuple(this.simulationInputs, ({ promise }: { promise: Promise<BaseOrMergeRollupPublicInputs> }) =>
        promise.then(input => PreviousRollupData.withEmptyProof(input)),
      ),
    );

    this.logger.debug(`Awaiting archive snapshot`, this.logdata);
    const { startArchiveSnapshot, newArchiveSiblingPath, previousBlockHash } = await this.archiveSnapshot.promise;

    const l1ToL2Roots = RootParityInput.withEmptyProof(rootParityInput, NESTED_RECURSIVE_PROOF_LENGTH);

    return BlockRootRollupInputs.from({
      previousRollupData,
      l1ToL2Roots,
      newL1ToL2Messages,
      newL1ToL2MessageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot,
      startArchiveSnapshot,
      newArchiveSiblingPath,
      previousBlockHash,
      proverId: this.context.proverId,
    });
  }

  @memoize
  private async buildProvingInputs() {
    const [rootParityProof, rootParityState] = await Promise.all([
      this.rootParityProvingInput.promise,
      this.rootParityStateInput.promise,
    ] as const);

    const {
      l1ToL2Messages: newL1ToL2Messages,
      messageTreeSnapshot: startL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageTreeRootSiblingPath,
    } = rootParityState;

    const rollupInputs = await Promise.all(mapTuple(this.provingInputs, ({ promise }) => promise));
    const previousRollupData: BlockRootRollupInputs['previousRollupData'] = mapTuple(
      rollupInputs,
      ({ inputs, proof, verificationKey }) =>
        new PreviousRollupData(inputs, proof, verificationKey.keyAsFields, getVKMembershipWitness(verificationKey)),
    );

    const l1ToL2Roots = new RootParityInput(
      rootParityProof.proof,
      rootParityProof.verificationKey,
      rootParityProof.vkPath,
      rootParityProof.publicInputs,
    );

    const { startArchiveSnapshot, newArchiveSiblingPath, previousBlockHash } = await this.archiveSnapshot.promise;

    return BlockRootRollupInputs.from({
      previousRollupData,
      l1ToL2Roots,
      newL1ToL2Messages,
      newL1ToL2MessageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot,
      startArchiveSnapshot,
      newArchiveSiblingPath,
      previousBlockHash,
      proverId: this.context.proverId,
    });
  }

  @memoize
  public async simulate(): Promise<BlockRootOrBlockMergePublicInputs> {
    this.logger.debug(`Awaiting simulation inputs`, this.logdata);
    const inputs = await this.buildSimulationInputs();
    this.logger.debug(`Acquired simulation inputs`, this.logdata);
    return this.context.simulator.simulate({ type: ProvingRequestType.BLOCK_ROOT_ROLLUP, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    this.logger.debug(`Awaiting proving inputs`, this.logdata);
    const inputs = await this.buildProvingInputs();
    this.logger.debug(`Acquired proving inputs`, this.logdata);
    const result = await this.context.prover.prove({ type: ProvingRequestType.BLOCK_ROOT_ROLLUP, inputs });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }

    return result;
  }
}
