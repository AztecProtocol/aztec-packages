import { BatchedBlobAccumulator, Blob, type SpongeBlob } from '@aztec/blob-lib';
import {
  ARCHIVE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256ToField, sha256Trunc } from '@aztec/foundation/crypto';
import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { type Tuple, assertLength, toFriendlyJSON } from '@aztec/foundation/serialize';
import { MembershipWitness, MerkleTreeCalculator, computeUnbalancedMerkleRoot } from '@aztec/foundation/trees';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataHint } from '@aztec/stdlib/avm';
import { Body } from '@aztec/stdlib/block';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
import {
  type BaseOrMergeRollupPublicInputs,
  BlockConstantData,
  type BlockRootOrBlockMergePublicInputs,
  PrivateBaseRollupHints,
  PrivateBaseStateDiffHints,
  PublicBaseRollupHints,
} from '@aztec/stdlib/rollup';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  getTreeHeight,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  ContentCommitment,
  type GlobalVariables,
  PartialStateReference,
  type ProcessedTx,
  StateReference,
  TxEffect,
} from '@aztec/stdlib/tx';
import { Attributes, type Span, runInSpan } from '@aztec/telemetry-client';
import type { MerkleTreeReadOperations } from '@aztec/world-state';

/**
 * Type representing the names of the trees for the base rollup.
 */
type BaseTreeNames = 'NoteHashTree' | 'ContractTree' | 'NullifierTree' | 'PublicDataTree';
/**
 * Type representing the names of the trees.
 */
export type TreeNames = BaseTreeNames | 'L1ToL2MessageTree' | 'Archive';

// Builds the hints for base rollup. Updating the contract, nullifier, and data trees in the process.
export const insertSideEffectsAndBuildBaseRollupHints = runInSpan(
  'BlockBuilderHelpers',
  'buildBaseRollupHints',
  async (
    span: Span,
    tx: ProcessedTx,
    globalVariables: GlobalVariables,
    // Passing in the snapshot instead of getting it from the db because it might've been updated in the orchestrator
    // when base parity proof is being generated.
    l1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    db: MerkleTreeWriteOperations,
    startSpongeBlob: SpongeBlob,
  ) => {
    span.setAttribute(Attributes.TX_HASH, tx.hash.toString());
    // Get trees info before any changes hit
    const lastArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);
    const start = new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
    );
    // Get the subtree sibling paths for the circuit
    const noteHashSubtreeSiblingPathArray = await getSubtreeSiblingPath(
      MerkleTreeId.NOTE_HASH_TREE,
      NOTE_HASH_SUBTREE_HEIGHT,
      db,
    );

    const noteHashSubtreeSiblingPath = makeTuple(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < noteHashSubtreeSiblingPathArray.length ? noteHashSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    // Update the note hash trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit, skipping the empty ones
    const noteHashes = padArrayEnd(tx.txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX);
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes);

    // Create data hint for reading fee payer initial balance in Fee Juice
    const leafSlot = await computeFeePayerBalanceLeafSlot(tx.data.feePayer);
    const feePayerFeeJuiceBalanceReadHint = await getPublicDataHint(db, leafSlot.toBigInt());

    // The read witnesses for a given TX should be generated before the writes of the same TX are applied.
    // All reads that refer to writes in the same tx are transient and can be simplified out.
    const txPublicDataUpdateRequestInfo = await processPublicDataUpdateRequests(tx, db);

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const {
      lowLeavesWitnessData: nullifierWitnessLeaves,
      newSubtreeSiblingPath: nullifiersSubtreeSiblingPath,
      sortedNewLeaves: sortednullifiers,
      sortedNewLeavesIndexes,
    } = await db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      padArrayEnd(tx.txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );

    if (nullifierWitnessLeaves === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }

    // Extract witness objects from returned data
    const nullifierPredecessorMembershipWitnessesWithoutPadding: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>[] =
      nullifierWitnessLeaves.map(l =>
        MembershipWitness.fromBufferArray(l.index, assertLength(l.siblingPath.toBufferArray(), NULLIFIER_TREE_HEIGHT)),
      );

    const nullifierSubtreeSiblingPathArray = nullifiersSubtreeSiblingPath.toFields();

    const nullifierSubtreeSiblingPath = makeTuple(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < nullifierSubtreeSiblingPathArray.length ? nullifierSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    // Append new data to startSpongeBlob
    const inputSpongeBlob = startSpongeBlob.clone();
    await startSpongeBlob.absorb(tx.txEffect.toBlobFields());

    const contractClassLogsFields = makeTuple(
      MAX_CONTRACT_CLASS_LOGS_PER_TX,
      i => tx.txEffect.contractClassLogs[i]?.fields || ContractClassLogFields.empty(),
    );

    if (tx.avmProvingRequest) {
      const blockHash = await tx.data.constants.historicalHeader.hash();
      const archiveRootMembershipWitness = await getMembershipWitnessFor(
        blockHash,
        MerkleTreeId.ARCHIVE,
        ARCHIVE_HEIGHT,
        db,
      );

      return PublicBaseRollupHints.from({
        startSpongeBlob: inputSpongeBlob,
        lastArchive,
        archiveRootMembershipWitness,
        contractClassLogsFields,
      });
    } else {
      if (
        txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses.length > 1 ||
        txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages.length > 1 ||
        txPublicDataUpdateRequestInfo.publicDataWritesSiblingPaths.length > 1
      ) {
        throw new Error(`More than one public data write in a private only tx`);
      }

      const feeWriteLowLeafPreimage =
        txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages[0] || PublicDataTreeLeafPreimage.empty();
      const feeWriteLowLeafMembershipWitness =
        txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses[0] ||
        MembershipWitness.empty<typeof PUBLIC_DATA_TREE_HEIGHT>(PUBLIC_DATA_TREE_HEIGHT);
      const feeWriteSiblingPath =
        txPublicDataUpdateRequestInfo.publicDataWritesSiblingPaths[0] ||
        makeTuple(PUBLIC_DATA_TREE_HEIGHT, () => Fr.ZERO);

      const stateDiffHints = PrivateBaseStateDiffHints.from({
        nullifierPredecessorPreimages: makeTuple(MAX_NULLIFIERS_PER_TX, i =>
          i < nullifierWitnessLeaves.length
            ? (nullifierWitnessLeaves[i].leafPreimage as NullifierLeafPreimage)
            : NullifierLeafPreimage.empty(),
        ),
        nullifierPredecessorMembershipWitnesses: makeTuple(MAX_NULLIFIERS_PER_TX, i =>
          i < nullifierPredecessorMembershipWitnessesWithoutPadding.length
            ? nullifierPredecessorMembershipWitnessesWithoutPadding[i]
            : makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
        ),
        sortedNullifiers: makeTuple(MAX_NULLIFIERS_PER_TX, i => Fr.fromBuffer(sortednullifiers[i])),
        sortedNullifierIndexes: makeTuple(MAX_NULLIFIERS_PER_TX, i => sortedNewLeavesIndexes[i]),
        noteHashSubtreeSiblingPath,
        nullifierSubtreeSiblingPath,
        feeWriteLowLeafPreimage,
        feeWriteLowLeafMembershipWitness,
        feeWriteSiblingPath,
      });

      const blockHash = await tx.data.constants.historicalHeader.hash();
      const archiveRootMembershipWitness = await getMembershipWitnessFor(
        blockHash,
        MerkleTreeId.ARCHIVE,
        ARCHIVE_HEIGHT,
        db,
      );

      const constants = BlockConstantData.from({
        lastArchive,
        lastL1ToL2: l1ToL2MessageTreeSnapshot,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractTreeRoot,
        globalVariables,
      });

      return PrivateBaseRollupHints.from({
        start,
        startSpongeBlob: inputSpongeBlob,
        stateDiffHints,
        feePayerFeeJuiceBalanceReadHint,
        archiveRootMembershipWitness,
        contractClassLogsFields,
        constants,
      });
    }
  },
);

export async function getPublicDataHint(db: MerkleTreeWriteOperations, leafSlot: bigint) {
  const { index } = (await db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot)) ?? {};
  if (index === undefined) {
    throw new Error(`Cannot find the previous value index for public data ${leafSlot}.`);
  }

  const siblingPath = await db.getSiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>(MerkleTreeId.PUBLIC_DATA_TREE, index);
  const membershipWitness = new MembershipWitness(PUBLIC_DATA_TREE_HEIGHT, index, siblingPath.toTuple());

  const leafPreimage = (await db.getLeafPreimage(MerkleTreeId.PUBLIC_DATA_TREE, index)) as PublicDataTreeLeafPreimage;
  if (!leafPreimage) {
    throw new Error(`Cannot find the leaf preimage for public data tree at index ${index}.`);
  }

  const exists = leafPreimage.leaf.slot.toBigInt() === leafSlot;
  const value = exists ? leafPreimage.leaf.value : Fr.ZERO;

  return new PublicDataHint(new Fr(leafSlot), value, membershipWitness, leafPreimage);
}

export const buildBlobHints = runInSpan(
  'BlockBuilderHelpers',
  'buildBlobHints',
  async (_span: Span, txEffects: TxEffect[]) => {
    const blobFields = txEffects.flatMap(tx => tx.toBlobFields());
    const blobs = await Blob.getBlobsPerBlock(blobFields);
    // TODO(#13430): The blobsHash is confusingly similar to blobCommitmentsHash, calculated from below blobCommitments:
    // - blobsHash := sha256([blobhash_0, ..., blobhash_m]) = a hash of all blob hashes in a block with m+1 blobs inserted into the header, exists so a user can cross check blobs.
    // - blobCommitmentsHash := sha256( ...sha256(sha256(C_0), C_1) ... C_n) = iteratively calculated hash of all blob commitments in an epoch with n+1 blobs (see calculateBlobCommitmentsHash()),
    //   exists so we can validate injected commitments to the rollup circuits correspond to the correct real blobs.
    // We may be able to combine these values e.g. blobCommitmentsHash := sha256( ...sha256(sha256(blobshash_0), blobshash_1) ... blobshash_l) for an epoch with l+1 blocks.
    const blobCommitments = blobs.map(b => BLS12Point.decompress(b.commitment));
    const blobsHash = new Fr(getBlobsHashFromBlobs(blobs));
    return { blobFields, blobCommitments, blobs, blobsHash };
  },
);

export const accumulateBlobs = runInSpan(
  'BlockBuilderHelpers',
  'accumulateBlobs',
  async (_span: Span, txs: ProcessedTx[], startBlobAccumulator: BatchedBlobAccumulator) => {
    const blobFields = txs.flatMap(tx => tx.txEffect.toBlobFields());
    const blobs = await Blob.getBlobsPerBlock(blobFields);
    const endBlobAccumulator = startBlobAccumulator.accumulateBlobs(blobs);
    return endBlobAccumulator;
  },
);

export const buildHeaderFromCircuitOutputs = runInSpan(
  'BlockBuilderHelpers',
  'buildHeaderFromCircuitOutputs',
  (
    _span,
    previousRollupData: BaseOrMergeRollupPublicInputs[],
    parityPublicInputs: ParityPublicInputs,
    rootRollupOutputs: BlockRootOrBlockMergePublicInputs,
    blobsHash: Fr,
    endState: StateReference,
  ) => {
    if (previousRollupData.length > 2) {
      throw new Error(`There can't be more than 2 previous rollups. Received ${previousRollupData.length}.`);
    }

    const outHash =
      previousRollupData.length === 0
        ? Fr.ZERO
        : previousRollupData.length === 1
          ? previousRollupData[0].outHash
          : sha256ToField([previousRollupData[0].outHash, previousRollupData[1].outHash]);
    const contentCommitment = new ContentCommitment(blobsHash, parityPublicInputs.shaRoot, outHash);

    const accumulatedFees = previousRollupData.reduce((sum, d) => sum.add(d.accumulatedFees), Fr.ZERO);
    const accumulatedManaUsed = previousRollupData.reduce((sum, d) => sum.add(d.accumulatedManaUsed), Fr.ZERO);

    return new BlockHeader(
      rootRollupOutputs.previousArchive,
      contentCommitment,
      endState,
      rootRollupOutputs.endGlobalVariables,
      accumulatedFees,
      accumulatedManaUsed,
    );
  },
);

export const buildHeaderAndBodyFromTxs = runInSpan(
  'BlockBuilderHelpers',
  'buildHeaderAndBodyFromTxs',
  async (
    span,
    txs: ProcessedTx[],
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    db: MerkleTreeReadOperations,
  ) => {
    span.setAttribute(Attributes.BLOCK_NUMBER, globalVariables.blockNumber);
    const stateReference = new StateReference(
      await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db),
      new PartialStateReference(
        await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
        await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
        await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
      ),
    );

    const previousArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);

    const txEffects = txs.map(tx => tx.txEffect);
    const body = new Body(txEffects);

    const numTxs = body.txEffects.length;
    const outHash =
      numTxs === 0
        ? Fr.ZERO
        : numTxs === 1
          ? new Fr(body.txEffects[0].txOutHash())
          : new Fr(
              computeUnbalancedMerkleRoot(
                body.txEffects.map(tx => tx.txOutHash()),
                TxEffect.empty().txOutHash(),
              ),
            );

    l1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    const hasher = (left: Buffer, right: Buffer) =>
      Promise.resolve(sha256Trunc(Buffer.concat([left, right])) as Buffer<ArrayBuffer>);
    const parityHeight = Math.ceil(Math.log2(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));
    const parityCalculator = await MerkleTreeCalculator.create(
      parityHeight,
      Fr.ZERO.toBuffer() as Buffer<ArrayBuffer>,
      hasher,
    );
    const parityShaRoot = new Fr(await parityCalculator.computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer())));
    const blobsHash = getBlobsHashFromBlobs(await Blob.getBlobsPerBlock(body.toBlobFields()));

    const contentCommitment = new ContentCommitment(blobsHash, parityShaRoot, outHash);

    const fees = body.txEffects.reduce((acc, tx) => acc.add(tx.transactionFee), Fr.ZERO);
    const manaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.billedGas.l2Gas)), Fr.ZERO);

    const header = new BlockHeader(previousArchive, contentCommitment, stateReference, globalVariables, fees, manaUsed);

    return { header, body };
  },
);

export function getBlobsHashFromBlobs(inputs: Blob[]): Fr {
  return sha256ToField(inputs.map(b => b.getEthVersionedBlobHash()));
}

// Note: tested against the constant values in block_root/empty_block_root_rollup_inputs.nr, set by block_building_helpers.test.ts.
// Having this separate fn hopefully makes it clear how we treat empty blocks and their blobs, and won't break if we decide to change how
// getBlobsPerBlock() works on empty input.
export async function getEmptyBlockBlobsHash(): Promise<Fr> {
  const blobHash = (await Blob.getBlobsPerBlock([])).map(b => b.getEthVersionedBlobHash());
  return sha256ToField(blobHash);
}

// Validate that the roots of all local trees match the output of the root circuit simulation
// TODO: does this get called?
export async function validateBlockRootOutput(
  blockRootOutput: BlockRootOrBlockMergePublicInputs,
  blockHeader: BlockHeader,
  db: MerkleTreeReadOperations,
) {
  await Promise.all([
    validateState(blockHeader.state, db),
    validateSimulatedTree(await getTreeSnapshot(MerkleTreeId.ARCHIVE, db), blockRootOutput.newArchive, 'Archive'),
  ]);
}

export const validateState = runInSpan(
  'BlockBuilderHelpers',
  'validateState',
  async (_span, state: StateReference, db: MerkleTreeReadOperations) => {
    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, db) };
      },
    );
    const snapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot> = new Map(
      (await Promise.all(promises)).map(obj => [obj.key, obj.value]),
    );
    validatePartialState(state.partial, snapshots);
    validateSimulatedTree(
      await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db),
      state.l1ToL2MessageTree,
      'L1ToL2MessageTree',
    );
  },
);

export async function getLastSiblingPath<TID extends MerkleTreeId>(treeId: TID, db: MerkleTreeReadOperations) {
  const { size } = await db.getTreeInfo(treeId);
  const path = await db.getSiblingPath(treeId, size - 1n);
  return padArrayEnd(path.toFields(), Fr.ZERO, getTreeHeight(treeId));
}

export async function getRootTreeSiblingPath<TID extends MerkleTreeId>(treeId: TID, db: MerkleTreeReadOperations) {
  const { size } = await db.getTreeInfo(treeId);
  const path = await db.getSiblingPath(treeId, size);
  return padArrayEnd(path.toFields(), Fr.ZERO, getTreeHeight(treeId));
}

export async function getTreeSnapshot(id: MerkleTreeId, db: MerkleTreeReadOperations): Promise<AppendOnlyTreeSnapshot> {
  const treeInfo = await db.getTreeInfo(id);
  return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
}

export function makeEmptyMembershipWitness<N extends number>(height: N) {
  return new MembershipWitness(
    height,
    0n,
    makeTuple(height, () => Fr.ZERO),
  );
}

const processPublicDataUpdateRequests = runInSpan(
  'BlockBuilderHelpers',
  'processPublicDataUpdateRequests',
  async (span, tx: ProcessedTx, db: MerkleTreeWriteOperations) => {
    span.setAttribute(Attributes.TX_HASH, tx.hash.toString());
    const allPublicDataWrites = tx.txEffect.publicDataWrites.map(
      ({ leafSlot, value }) => new PublicDataTreeLeaf(leafSlot, value),
    );

    const { lowLeavesWitnessData, insertionWitnessData } = await db.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      allPublicDataWrites.map(write => {
        if (write.isEmpty()) {
          throw new Error(`Empty public data write in tx: ${toFriendlyJSON(tx)}`);
        }
        return write.toBuffer();
      }),
    );

    const lowPublicDataWritesPreimages = lowLeavesWitnessData.map(
      lowLeafWitness => lowLeafWitness.leafPreimage as PublicDataTreeLeafPreimage,
    );
    const lowPublicDataWritesMembershipWitnesses = lowLeavesWitnessData.map(lowLeafWitness =>
      MembershipWitness.fromBufferArray<typeof PUBLIC_DATA_TREE_HEIGHT>(
        lowLeafWitness.index,
        assertLength(lowLeafWitness.siblingPath.toBufferArray(), PUBLIC_DATA_TREE_HEIGHT),
      ),
    );
    const publicDataWritesSiblingPaths = insertionWitnessData.map(w => {
      const insertionSiblingPath = w.siblingPath.toFields();
      assertLength(insertionSiblingPath, PUBLIC_DATA_TREE_HEIGHT);
      return insertionSiblingPath as Tuple<Fr, typeof PUBLIC_DATA_TREE_HEIGHT>;
    });

    return {
      lowPublicDataWritesPreimages,
      lowPublicDataWritesMembershipWitnesses,
      publicDataWritesSiblingPaths,
    };
  },
);

export async function getSubtreeSiblingPath(
  treeId: MerkleTreeId,
  subtreeHeight: number,
  db: MerkleTreeReadOperations,
): Promise<Fr[]> {
  const nextAvailableLeafIndex = await db.getTreeInfo(treeId).then(t => t.size);
  const fullSiblingPath = await db.getSiblingPath(treeId, nextAvailableLeafIndex);

  // Drop the first subtreeHeight items since we only care about the path to the subtree root
  return fullSiblingPath.getSubtreeSiblingPath(subtreeHeight).toFields();
}

// Scan a tree searching for a specific value and return a membership witness proof for it
export async function getMembershipWitnessFor<N extends number>(
  value: Fr,
  treeId: MerkleTreeId,
  height: N,
  db: MerkleTreeReadOperations,
): Promise<MembershipWitness<N>> {
  // If this is an empty tx, then just return zeroes
  if (value.isZero()) {
    return makeEmptyMembershipWitness(height);
  }

  const index = (await db.findLeafIndices(treeId, [value.toBuffer()]))[0];
  if (index === undefined) {
    throw new Error(`Leaf with value ${value} not found in tree ${MerkleTreeId[treeId]}`);
  }
  const path = await db.getSiblingPath(treeId, index);
  return new MembershipWitness(height, index, assertLength(path.toFields(), height));
}

export function validatePartialState(
  partialState: PartialStateReference,
  treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
) {
  validateSimulatedTree(treeSnapshots.get(MerkleTreeId.NOTE_HASH_TREE)!, partialState.noteHashTree, 'NoteHashTree');
  validateSimulatedTree(treeSnapshots.get(MerkleTreeId.NULLIFIER_TREE)!, partialState.nullifierTree, 'NullifierTree');
  validateSimulatedTree(
    treeSnapshots.get(MerkleTreeId.PUBLIC_DATA_TREE)!,
    partialState.publicDataTree,
    'PublicDataTree',
  );
}

// Helper for comparing two trees snapshots
function validateSimulatedTree(
  localTree: AppendOnlyTreeSnapshot,
  simulatedTree: AppendOnlyTreeSnapshot,
  name: TreeNames,
  label?: string,
) {
  if (!simulatedTree.root.toBuffer().equals(localTree.root.toBuffer())) {
    throw new Error(`${label ?? name} tree root mismatch (local ${localTree.root}, simulated ${simulatedTree.root})`);
  }
  if (simulatedTree.nextAvailableLeafIndex !== localTree.nextAvailableLeafIndex) {
    throw new Error(
      `${label ?? name} tree next available leaf index mismatch (local ${localTree.nextAvailableLeafIndex}, simulated ${
        simulatedTree.nextAvailableLeafIndex
      })`,
    );
  }
}

export function validateTx(tx: ProcessedTx) {
  const txHeader = tx.data.constants.historicalHeader;
  if (txHeader.state.l1ToL2MessageTree.isEmpty()) {
    throw new Error(`Empty L1 to L2 messages tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.noteHashTree.isEmpty()) {
    throw new Error(`Empty note hash tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.nullifierTree.isEmpty()) {
    throw new Error(`Empty nullifier tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.publicDataTree.isEmpty()) {
    throw new Error(`Empty public data tree in tx: ${toFriendlyJSON(tx)}`);
  }
}
