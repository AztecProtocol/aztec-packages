import {
  Body,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  TxEffect,
  getTreeHeight,
} from '@aztec/circuit-types';
import {
  ARCHIVE_HEIGHT,
  AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  BlockHeader,
  BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  ConstantRollupData,
  ContentCommitment,
  Fr,
  type GlobalVariables,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MembershipWitness,
  MergeRollupInputs,
  MerkleTreeCalculator,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NullifierLeafPreimage,
  PUBLIC_DATA_TREE_HEIGHT,
  type ParityPublicInputs,
  PartialStateReference,
  PreviousRollupBlockData,
  PreviousRollupData,
  PrivateBaseRollupHints,
  PrivateBaseStateDiffHints,
  PublicBaseRollupHints,
  PublicBaseStateDiffHints,
  PublicDataHint,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  type RecursiveProof,
  RootRollupInputs,
  type SpongeBlob,
  StateReference,
  VK_TREE_HEIGHT,
  type VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { Blob } from '@aztec/foundation/blob';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { type Logger } from '@aztec/foundation/log';
import { type Tuple, assertLength, serializeToBuffer, toFriendlyJSON } from '@aztec/foundation/serialize';
import { computeUnbalancedMerkleRoot } from '@aztec/foundation/trees';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/simulator';
import { type MerkleTreeReadOperations } from '@aztec/world-state';

import { inspect } from 'util';

/**
 * Type representing the names of the trees for the base rollup.
 */
type BaseTreeNames = 'NoteHashTree' | 'ContractTree' | 'NullifierTree' | 'PublicDataTree';
/**
 * Type representing the names of the trees.
 */
export type TreeNames = BaseTreeNames | 'L1ToL2MessageTree' | 'Archive';

// Builds the hints for base rollup. Updating the contract, nullifier, and data trees in the process.
export async function buildBaseRollupHints(
  tx: ProcessedTx,
  globalVariables: GlobalVariables,
  db: MerkleTreeWriteOperations,
  startSpongeBlob: SpongeBlob,
) {
  // Get trees info before any changes hit
  const constants = await getConstantRollupData(globalVariables, db);
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
  startSpongeBlob.absorb(tx.txEffect.toBlobFields());

  if (tx.avmProvingRequest) {
    // Build public base rollup hints
    const stateDiffHints = PublicBaseStateDiffHints.from({
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
      lowPublicDataWritesPreimages: padArrayEnd(
        txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages,
        PublicDataTreeLeafPreimage.empty(),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
      lowPublicDataWritesMembershipWitnesses: padArrayEnd(
        txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses,
        MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
      publicDataTreeSiblingPaths: padArrayEnd(
        txPublicDataUpdateRequestInfo.publicDataWritesSiblingPaths,
        makeTuple(PUBLIC_DATA_TREE_HEIGHT, () => Fr.ZERO),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
    });

    const blockHash = tx.constants.historicalHeader.hash();
    const archiveRootMembershipWitness = await getMembershipWitnessFor(
      blockHash,
      MerkleTreeId.ARCHIVE,
      ARCHIVE_HEIGHT,
      db,
    );

    return PublicBaseRollupHints.from({
      start,
      startSpongeBlob: inputSpongeBlob,
      stateDiffHints,
      archiveRootMembershipWitness,
      constants,
    });
  } else {
    if (
      txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses.length > 1 ||
      txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages.length > 1 ||
      txPublicDataUpdateRequestInfo.publicDataWritesSiblingPaths.length > 1
    ) {
      throw new Error(`More than one public data write in a private only tx`);
    }

    // Create data hint for reading fee payer initial balance in Fee Juice
    // If no fee payer is set, read hint should be empty
    const leafSlot = computeFeePayerBalanceLeafSlot(tx.data.feePayer);
    const feePayerFeeJuiceBalanceReadHint = tx.data.feePayer.isZero()
      ? PublicDataHint.empty()
      : await getPublicDataHint(db, leafSlot.toBigInt());

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

    const blockHash = tx.constants.historicalHeader.hash();
    const archiveRootMembershipWitness = await getMembershipWitnessFor(
      blockHash,
      MerkleTreeId.ARCHIVE,
      ARCHIVE_HEIGHT,
      db,
    );

    return PrivateBaseRollupHints.from({
      start,
      startSpongeBlob: inputSpongeBlob,
      stateDiffHints,
      feePayerFeeJuiceBalanceReadHint: feePayerFeeJuiceBalanceReadHint,
      archiveRootMembershipWitness,
      constants,
    });
  }
}

async function getPublicDataHint(db: MerkleTreeWriteOperations, leafSlot: bigint) {
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

  const exists = leafPreimage.slot.toBigInt() === leafSlot;
  const value = exists ? leafPreimage.value : Fr.ZERO;

  return new PublicDataHint(new Fr(leafSlot), value, membershipWitness, leafPreimage);
}

export function createMergeRollupInputs(
  left: [BaseOrMergeRollupPublicInputs, RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>, VerificationKeyAsFields],
  right: [BaseOrMergeRollupPublicInputs, RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>, VerificationKeyAsFields],
) {
  const mergeInputs = new MergeRollupInputs([
    getPreviousRollupDataFromPublicInputs(left[0], left[1], left[2]),
    getPreviousRollupDataFromPublicInputs(right[0], right[1], right[2]),
  ]);
  return mergeInputs;
}

export function createBlockMergeRollupInputs(
  left: [
    BlockRootOrBlockMergePublicInputs,
    RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    VerificationKeyAsFields,
  ],
  right: [
    BlockRootOrBlockMergePublicInputs,
    RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    VerificationKeyAsFields,
  ],
) {
  const mergeInputs = new BlockMergeRollupInputs([
    getPreviousRollupBlockDataFromPublicInputs(left[0], left[1], left[2]),
    getPreviousRollupBlockDataFromPublicInputs(right[0], right[1], right[2]),
  ]);
  return mergeInputs;
}

export function buildHeaderFromCircuitOutputs(
  previousMergeData: [BaseOrMergeRollupPublicInputs, BaseOrMergeRollupPublicInputs],
  parityPublicInputs: ParityPublicInputs,
  rootRollupOutputs: BlockRootOrBlockMergePublicInputs,
  updatedL1ToL2TreeSnapshot: AppendOnlyTreeSnapshot,
  logger?: Logger,
) {
  const blobsHash = rootRollupOutputs.blobPublicInputs[0].getBlobsHash();
  const contentCommitment = new ContentCommitment(
    new Fr(previousMergeData[0].numTxs + previousMergeData[1].numTxs),
    blobsHash,
    parityPublicInputs.shaRoot.toBuffer(),
    sha256Trunc(Buffer.concat([previousMergeData[0].outHash.toBuffer(), previousMergeData[1].outHash.toBuffer()])),
  );
  const state = new StateReference(updatedL1ToL2TreeSnapshot, previousMergeData[1].end);
  const header = new BlockHeader(
    rootRollupOutputs.previousArchive,
    contentCommitment,
    state,
    previousMergeData[0].constants.globalVariables,
    previousMergeData[0].accumulatedFees.add(previousMergeData[1].accumulatedFees),
    previousMergeData[0].accumulatedManaUsed.add(previousMergeData[1].accumulatedManaUsed),
  );
  if (!header.hash().equals(rootRollupOutputs.endBlockHash)) {
    logger?.error(
      `Block header mismatch when building header from circuit outputs.` +
        `\n\nHeader: ${inspect(header)}` +
        `\n\nCircuit: ${toFriendlyJSON(rootRollupOutputs)}`,
    );
    throw new Error(`Block header mismatch when building from circuit outputs`);
  }
  return header;
}

export async function buildHeaderAndBodyFromTxs(
  txs: ProcessedTx[],
  globalVariables: GlobalVariables,
  l1ToL2Messages: Fr[],
  db: MerkleTreeReadOperations,
) {
  const stateReference = new StateReference(
    await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, db),
    new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
    ),
  );

  const previousArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, db);

  const nonEmptyTxEffects: TxEffect[] = txs.map(tx => tx.txEffect).filter(txEffect => !txEffect.isEmpty());
  const body = new Body(nonEmptyTxEffects);

  const outHash = computeUnbalancedMerkleRoot(
    body.txEffects.map(tx => tx.txOutHash()),
    TxEffect.empty().txOutHash(),
  );

  l1ToL2Messages = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  const hasher = (left: Buffer, right: Buffer) => sha256Trunc(Buffer.concat([left, right]));
  const parityHeight = Math.ceil(Math.log2(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));
  const parityShaRoot = new MerkleTreeCalculator(parityHeight, Fr.ZERO.toBuffer(), hasher).computeTreeRoot(
    l1ToL2Messages.map(msg => msg.toBuffer()),
  );
  const blobsHash = getBlobsHashFromBlobs(Blob.getBlobs(body.toBlobFields()));

  const contentCommitment = new ContentCommitment(
    new Fr(body.numberOfTxsIncludingPadded),
    blobsHash,
    parityShaRoot,
    outHash,
  );

  const fees = body.txEffects.reduce((acc, tx) => acc.add(tx.transactionFee), Fr.ZERO);
  const manaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.totalGas.l2Gas)), Fr.ZERO);

  const header = new BlockHeader(previousArchive, contentCommitment, stateReference, globalVariables, fees, manaUsed);

  return { header, body };
}

export function getBlobsHashFromBlobs(inputs: Blob[]): Buffer {
  const blobHashes = serializeToBuffer(inputs.map(b => b.getEthVersionedBlobHash()));
  return sha256Trunc(serializeToBuffer(blobHashes));
}

// Validate that the roots of all local trees match the output of the root circuit simulation
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

export async function validateState(state: StateReference, db: MerkleTreeReadOperations) {
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
}

export async function getRootTreeSiblingPath<TID extends MerkleTreeId>(treeId: TID, db: MerkleTreeReadOperations) {
  const { size } = await db.getTreeInfo(treeId);
  const path = await db.getSiblingPath(treeId, size);
  return padArrayEnd(path.toFields(), Fr.ZERO, getTreeHeight(treeId));
}

// Builds the inputs for the final root rollup circuit, without making any changes to trees
export function getRootRollupInput(
  rollupOutputLeft: BlockRootOrBlockMergePublicInputs,
  rollupProofLeft: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  verificationKeyLeft: VerificationKeyAsFields,
  rollupOutputRight: BlockRootOrBlockMergePublicInputs,
  rollupProofRight: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  verificationKeyRight: VerificationKeyAsFields,
  proverId: Fr,
) {
  const previousRollupData: RootRollupInputs['previousRollupData'] = [
    getPreviousRollupBlockDataFromPublicInputs(rollupOutputLeft, rollupProofLeft, verificationKeyLeft),
    getPreviousRollupBlockDataFromPublicInputs(rollupOutputRight, rollupProofRight, verificationKeyRight),
  ];

  return RootRollupInputs.from({
    previousRollupData,
    proverId,
  });
}

export function getPreviousRollupDataFromPublicInputs(
  rollupOutput: BaseOrMergeRollupPublicInputs,
  rollupProof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  vk: VerificationKeyAsFields,
) {
  const leafIndex = getVKIndex(vk);

  return new PreviousRollupData(
    rollupOutput,
    rollupProof,
    vk,
    new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)),
  );
}

export function getPreviousRollupBlockDataFromPublicInputs(
  rollupOutput: BlockRootOrBlockMergePublicInputs,
  rollupProof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  vk: VerificationKeyAsFields,
) {
  const leafIndex = getVKIndex(vk);

  return new PreviousRollupBlockData(
    rollupOutput,
    rollupProof,
    vk,
    new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)),
  );
}

export async function getConstantRollupData(
  globalVariables: GlobalVariables,
  db: MerkleTreeReadOperations,
): Promise<ConstantRollupData> {
  return ConstantRollupData.from({
    vkTreeRoot: getVKTreeRoot(),
    protocolContractTreeRoot,
    lastArchive: await getTreeSnapshot(MerkleTreeId.ARCHIVE, db),
    globalVariables,
  });
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

async function processPublicDataUpdateRequests(tx: ProcessedTx, db: MerkleTreeWriteOperations) {
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
}

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
  const txHeader = tx.constants.historicalHeader;
  if (txHeader.state.l1ToL2MessageTree.isZero()) {
    throw new Error(`Empty L1 to L2 messages tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.noteHashTree.isZero()) {
    throw new Error(`Empty note hash tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.nullifierTree.isZero()) {
    throw new Error(`Empty nullifier tree in tx: ${toFriendlyJSON(tx)}`);
  }
  if (txHeader.state.partial.publicDataTree.isZero()) {
    throw new Error(`Empty public data tree in tx: ${toFriendlyJSON(tx)}`);
  }
}
