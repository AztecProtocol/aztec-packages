import { createDebugLogger } from '@aztec/aztec.js';
import {
  type BlockSimulator,
  Body,
  L2Block,
  MerkleTreeId,
  type MerkleTreeOperations,
  PROVING_STATUS,
  type ProcessedTx,
  type ProvingTicket,
  type SimulationBlockResult,
  TxEffect,
  makeEmptyProcessedTx,
  toTxEffect,
} from '@aztec/circuit-types';
import {
  ContentCommitment,
  Fr,
  type GlobalVariables,
  Header,
  MerkleTreeCalculator,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  NUM_MSGS_PER_BASE_PARITY,
  PartialStateReference,
  StateReference,
  VerificationKeyData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { computeUnbalancedMerkleRoot } from '@aztec/foundation/trees';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { buildBaseRollupInput, getTreeSnapshot } from '@aztec/prover-client/helpers';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

/**
 * Implements a block simulator using a test circuit prover under the hood, which just simulates circuits and outputs empty proofs.
 * This class is temporary and should die once we switch from tx effects to tx objects submissions, since sequencers won't have
 * the need to create L2 block headers to submit to L1. When we do that, we should also remove the references to the
 * prover-client and bb-prover packages from this package.
 */
export class LightweightBlockBuilder implements BlockSimulator {
  private numTxs?: number;
  private globalVariables?: GlobalVariables;
  private l1ToL2Messages?: Fr[];

  private readonly txs: ProcessedTx[] = [];

  private readonly logger = createDebugLogger('aztec:sequencer-client:block_builder_light');

  constructor(private db: MerkleTreeOperations, private telemetry: TelemetryClient) {}

  async startNewBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<ProvingTicket> {
    this.logger.verbose('Starting new block', { numTxs, globalVariables, l1ToL2Messages });
    this.numTxs = numTxs;
    this.globalVariables = globalVariables;
    this.l1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    // Update L1 to L2 tree
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.l1ToL2Messages!);

    // Nothing to prove, so we return an already resolved promise
    return { provingPromise: Promise.resolve({ status: PROVING_STATUS.SUCCESS }) };
  }

  async addNewTx(tx: ProcessedTx): Promise<void> {
    this.logger.verbose('Adding new tx to block', { txHash: tx.hash.toString() });
    this.txs.push(tx);
    await buildBaseRollupInput(
      tx,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      this.globalVariables!,
      this.db,
      VerificationKeyData.makeFake(),
    );
  }

  cancelBlock(): void {}

  async setBlockCompleted(): Promise<void> {
    const paddingTxCount = this.numTxs! - this.txs.length;
    this.logger.verbose(`Setting block as completed and adding ${paddingTxCount} padding txs`);
    for (let i = 0; i < paddingTxCount; i++) {
      await this.addNewTx(
        makeEmptyProcessedTx(
          this.db.getInitialHeader(),
          this.globalVariables!.chainId,
          this.globalVariables!.version,
          getVKTreeRoot(),
        ),
      );
    }
  }

  async finaliseBlock(): Promise<SimulationBlockResult> {
    this.logger.verbose(`Finalising block`);
    const nonEmptyTxEffects: TxEffect[] = this.txs
      .map(tx => toTxEffect(tx, this.globalVariables!.gasFees))
      .filter(txEffect => !txEffect.isEmpty());
    const body = new Body(nonEmptyTxEffects);
    const header = await this.makeHeader(body);

    await this.db.updateArchive(header);
    const newArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const block = new L2Block(newArchive, header, body);
    return { block };
  }

  private async makeHeader(body: Body): Promise<Header> {
    const { db } = this;

    const stateReference = new StateReference(
      await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db),
      new PartialStateReference(
        await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
        await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
        await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
      ),
    );

    const previousArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);

    const outHash = computeUnbalancedMerkleRoot(
      body.txEffects.map(tx => tx.txOutHash()),
      TxEffect.empty().txOutHash(),
    );

    const paritySize = NUM_BASE_PARITY_PER_ROOT_PARITY * NUM_MSGS_PER_BASE_PARITY;
    const parityHeight = Math.ceil(Math.log2(paritySize));
    const hasher = (left: Buffer, right: Buffer) => sha256Trunc(Buffer.concat([left, right]));
    const parityShaRoot = new MerkleTreeCalculator(parityHeight, Fr.ZERO.toBuffer(), hasher).computeTreeRoot(
      this.l1ToL2Messages!.map(msg => msg.toBuffer()),
    );

    const contentCommitment = new ContentCommitment(
      new Fr(this.numTxs!),
      body.getTxsEffectsHash(),
      parityShaRoot,
      outHash,
    );

    const fees = this.txs!.reduce(
      (acc, tx) =>
        acc
          .add(tx.data.constants.txContext.gasSettings.inclusionFee)
          .add(tx.data.end.gasUsed.computeFee(this.globalVariables!.gasFees)),
      Fr.ZERO,
    );

    return new Header(previousArchive, contentCommitment, stateReference, this.globalVariables!, fees);
  }
}

export class LightweightBlockBuilderFactory {
  constructor(private telemetry?: TelemetryClient) {}

  create(db: MerkleTreeOperations): BlockSimulator {
    return new LightweightBlockBuilder(db, this.telemetry ?? new NoopTelemetryClient());
  }
}
