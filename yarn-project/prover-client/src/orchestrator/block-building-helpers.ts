import {
  BatchedBlob,
  BatchedBlobAccumulator,
  SpongeBlob,
  computeBlobsHashFromBlobs,
  encodeBlockBlobData,
  getBlobCommitmentsFromBlobs,
  getBlobsPerL1Block,
} from '@aztec/blob-lib';
import {
  ARCHIVE_HEIGHT,
  CHONK_PROOF_LENGTH,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Bufferable, assertLength, toFriendlyJSON } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { getVkData } from '@aztec/noir-protocol-circuits-types/server/vks';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { Body } from '@aztec/stdlib/block';
import type { MerkleTreeWriteOperations, PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import { Proof, ProofData, RecursiveProof } from '@aztec/stdlib/proofs';
import {
  BlockConstantData,
  BlockRollupPublicInputs,
  PrivateBaseRollupHints,
  PublicBaseRollupHints,
  PublicChonkVerifierPrivateInputs,
  TreeSnapshotDiffHints,
} from '@aztec/stdlib/rollup';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  NullifierLeafPreimage,
  PublicDataTreeLeafPreimage,
  getTreeHeight,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  PartialStateReference,
  type ProcessedTx,
  StateReference,
  Tx,
} from '@aztec/stdlib/tx';
import { VkData } from '@aztec/stdlib/vks';
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
    lastArchive: AppendOnlyTreeSnapshot,
    newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    startSpongeBlob: SpongeBlob,
    proverId: Fr,
    db: MerkleTreeWriteOperations,
  ) => {
    span.setAttribute(Attributes.TX_HASH, tx.hash.toString());
    // Get trees info before any changes hit
    const start = new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
    );

    // Get the note hash subtree root sibling path for insertion.
    const noteHashSubtreeRootSiblingPath = assertLength(
      await getSubtreeSiblingPath(MerkleTreeId.NOTE_HASH_TREE, NOTE_HASH_SUBTREE_HEIGHT, db),
      NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
    );

    const { nullifierInsertionResult, publicDataInsertionResult } = await insertSideEffects(tx, db);

    const blockHash = await tx.data.constants.anchorBlockHeader.hash();
    const anchorBlockArchiveSiblingPath = (
      await getMembershipWitnessFor(blockHash, MerkleTreeId.ARCHIVE, ARCHIVE_HEIGHT, db)
    ).siblingPath;

    const contractClassLogsFields = makeTuple(
      MAX_CONTRACT_CLASS_LOGS_PER_TX,
      i => tx.txEffect.contractClassLogs[i]?.fields || ContractClassLogFields.empty(),
    );

    if (tx.avmProvingRequest) {
      return PublicBaseRollupHints.from({
        startSpongeBlob,
        lastArchive,
        anchorBlockArchiveSiblingPath,
        contractClassLogsFields,
      });
    } else {
      if (tx.txEffect.publicDataWrites.length > 1) {
        throw new Error(`More than one public data write in a private only tx`);
      }

      // Get hints for reading fee payer's balance in the public data tree.
      const feePayerBalanceLeafWitnessData = publicDataInsertionResult.lowLeavesWitnessData[0];
      const feePayerBalanceMembershipWitness = MembershipWitness.fromBufferArray<typeof PUBLIC_DATA_TREE_HEIGHT>(
        feePayerBalanceLeafWitnessData.index,
        assertLength(feePayerBalanceLeafWitnessData.siblingPath.toBufferArray(), PUBLIC_DATA_TREE_HEIGHT),
      );
      const feePayerBalanceLeafPreimage = feePayerBalanceLeafWitnessData.leafPreimage as PublicDataTreeLeafPreimage;
      const leafSlot = await computeFeePayerBalanceLeafSlot(tx.data.feePayer);
      if (!leafSlot.equals(feePayerBalanceLeafPreimage.leaf.slot)) {
        throw new Error(`Cannot find the public data tree leaf for the fee payer's balance`);
      }

      // Get hints for inserting the nullifiers.
      const nullifierLowLeavesWitnessData = nullifierInsertionResult.lowLeavesWitnessData!;
      const nullifierPredecessorPreimages = padArrayEnd(
        nullifierLowLeavesWitnessData.map(l => l.leafPreimage as NullifierLeafPreimage),
        NullifierLeafPreimage.empty(),
        MAX_NULLIFIERS_PER_TX,
      );
      const nullifierPredecessorMembershipWitnesses = padArrayEnd(
        nullifierLowLeavesWitnessData.map(l =>
          MembershipWitness.fromBufferArray<typeof NULLIFIER_TREE_HEIGHT>(
            l.index,
            assertLength(l.siblingPath.toBufferArray(), NULLIFIER_TREE_HEIGHT),
          ),
        ),
        makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
        MAX_NULLIFIERS_PER_TX,
      );
      const sortedNullifiers = assertLength(
        nullifierInsertionResult.sortedNewLeaves.map(n => Fr.fromBuffer(n)),
        MAX_NULLIFIERS_PER_TX,
      );
      const sortedNullifierIndexes = assertLength(
        nullifierInsertionResult.sortedNewLeavesIndexes,
        MAX_NULLIFIERS_PER_TX,
      );
      const nullifierSubtreeRootSiblingPath = assertLength(
        nullifierInsertionResult.newSubtreeSiblingPath.toFields(),
        NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
      );

      const treeSnapshotDiffHints = TreeSnapshotDiffHints.from({
        noteHashSubtreeRootSiblingPath,
        nullifierPredecessorPreimages,
        nullifierPredecessorMembershipWitnesses,
        sortedNullifiers,
        sortedNullifierIndexes,
        nullifierSubtreeRootSiblingPath,
        feePayerBalanceMembershipWitness,
      });

      const constants = BlockConstantData.from({
        lastArchive,
        l1ToL2TreeSnapshot: newL1ToL2MessageTreeSnapshot,
        vkTreeRoot: tx.data.constants.vkTreeRoot,
        protocolContractsHash: tx.data.constants.protocolContractsHash,
        globalVariables: tx.globalVariables,
        proverId,
      });

      return PrivateBaseRollupHints.from({
        start,
        startSpongeBlob,
        treeSnapshotDiffHints,
        feePayerBalanceLeafPreimage,
        anchorBlockArchiveSiblingPath,
        contractClassLogsFields,
        constants,
      });
    }
  },
);

export const insertSideEffects = runInSpan(
  'BlockBuilderHelpers',
  'buildBaseRollupHints',
  async (span: Span, tx: ProcessedTx, db: MerkleTreeWriteOperations) => {
    span.setAttribute(Attributes.TX_HASH, tx.hash.toString());

    // Insert the note hashes. Padded with zeros to the max number of note hashes per tx.
    const noteHashes = padArrayEnd(tx.txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX);
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes);

    // Insert the nullifiers. Padded with zeros to the max number of nullifiers per tx.
    // Capturing the low nullifier info for each individual operation.
    const nullifierInsertionResult = await db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      padArrayEnd(tx.txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    if (nullifierInsertionResult.lowLeavesWitnessData === undefined) {
      throw new Error(`Failed to batch insert nullifiers.`);
    }

    if (tx.txEffect.publicDataWrites.some(write => write.isEmpty())) {
      throw new Error(`Empty public data write in tx: ${toFriendlyJSON(tx)}.`);
    }
    // Insert the public data writes sequentially. No need to pad them to the max array size.
    // Capturing the low leaf info for each individual operation.
    const publicDataInsertionResult = await db.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      tx.txEffect.publicDataWrites.map(write => write.toBuffer()),
    );

    return {
      nullifierInsertionResult,
      publicDataInsertionResult,
    };
  },
);

export function getChonkProofFromTx(tx: Tx | ProcessedTx) {
  const publicInputs = tx.data.publicInputs().toFields();

  const binaryProof = new Proof(
    Buffer.concat(tx.chonkProof.attachPublicInputs(publicInputs).fieldsWithPublicInputs.map(field => field.toBuffer())),
    publicInputs.length,
  );
  return new RecursiveProof(tx.chonkProof.fields, binaryProof, true, CHONK_PROOF_LENGTH);
}

export function getPublicChonkVerifierPrivateInputsFromTx(tx: Tx | ProcessedTx, proverId: Fr) {
  const proofData = new ProofData(
    tx.data.toPrivateToPublicKernelCircuitPublicInputs(),
    getChonkProofFromTx(tx),
    getVkData('HidingKernelToPublic'),
  );
  return new PublicChonkVerifierPrivateInputs(proofData, proverId);
}

// Build "hints" as the private inputs for the checkpoint root rollup circuit.
// The `blobCommitments` will be accumulated and checked in the root rollup against the `finalBlobChallenges`.
// The `blobsHash` will be validated on L1 against the submitted blob data.
export const buildBlobHints = (blobFields: Fr[]) => {
  const blobs = getBlobsPerL1Block(blobFields);
  const blobCommitments = getBlobCommitmentsFromBlobs(blobs);
  const blobsHash = computeBlobsHashFromBlobs(blobs);
  return { blobCommitments, blobs, blobsHash };
};

export const buildFinalBlobChallenges = async (blobFieldsPerCheckpoint: Fr[][]) => {
  return await BatchedBlob.precomputeBatchedBlobChallenges(blobFieldsPerCheckpoint);
};

export const accumulateBlobs = runInSpan(
  'BlockBuilderHelpers',
  'accumulateBlobs',
  async (_span: Span, blobFields: Fr[], startBlobAccumulator: BatchedBlobAccumulator) => {
    const endBlobAccumulator = await startBlobAccumulator.accumulateFields(blobFields);
    return endBlobAccumulator;
  },
);

export const buildHeaderFromCircuitOutputs = runInSpan(
  'BlockBuilderHelpers',
  'buildHeaderFromCircuitOutputs',
  async (_span, blockRootRollupOutput: BlockRollupPublicInputs) => {
    const constants = blockRootRollupOutput.constants;
    const globalVariables = GlobalVariables.from({
      chainId: constants.chainId,
      version: constants.version,
      blockNumber: blockRootRollupOutput.previousArchive.nextAvailableLeafIndex,
      timestamp: blockRootRollupOutput.endTimestamp,
      slotNumber: constants.slotNumber,
      coinbase: constants.coinbase,
      feeRecipient: constants.feeRecipient,
      gasFees: constants.gasFees,
    });

    const spongeBlobHash = await blockRootRollupOutput.endSpongeBlob.clone().squeeze();

    return new BlockHeader(
      blockRootRollupOutput.previousArchive,
      blockRootRollupOutput.endState,
      spongeBlobHash,
      globalVariables,
      blockRootRollupOutput.accumulatedFees,
      blockRootRollupOutput.accumulatedManaUsed,
    );
  },
);

export const buildHeaderAndBodyFromTxs = runInSpan(
  'BlockBuilderHelpers',
  'buildHeaderAndBodyFromTxs',
  async (
    span,
    txs: ProcessedTx[],
    lastArchive: AppendOnlyTreeSnapshot,
    endState: StateReference,
    globalVariables: GlobalVariables,
    startSpongeBlob: SpongeBlob,
    isFirstBlock: boolean,
  ) => {
    span.setAttribute(Attributes.BLOCK_NUMBER, globalVariables.blockNumber);

    const txEffects = txs.map(tx => tx.txEffect);
    const body = new Body(txEffects);

    const totalFees = txEffects.reduce((acc, tx) => acc.add(tx.transactionFee), Fr.ZERO);
    const totalManaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.billedGas.l2Gas)), Fr.ZERO);

    const { l1ToL2MessageTree, partial } = endState;

    const blockBlobFields = encodeBlockBlobData({
      blockEndMarker: {
        timestamp: globalVariables.timestamp,
        blockNumber: globalVariables.blockNumber,
        numTxs: txs.length,
      },
      blockEndStateField: {
        l1ToL2MessageNextAvailableLeafIndex: l1ToL2MessageTree.nextAvailableLeafIndex,
        noteHashNextAvailableLeafIndex: partial.noteHashTree.nextAvailableLeafIndex,
        nullifierNextAvailableLeafIndex: partial.nullifierTree.nextAvailableLeafIndex,
        publicDataNextAvailableLeafIndex: partial.publicDataTree.nextAvailableLeafIndex,
        totalManaUsed: totalManaUsed.toBigInt(),
      },
      lastArchiveRoot: lastArchive.root,
      noteHashRoot: partial.noteHashTree.root,
      nullifierRoot: partial.nullifierTree.root,
      publicDataRoot: partial.publicDataTree.root,
      l1ToL2MessageRoot: isFirstBlock ? l1ToL2MessageTree.root : undefined,
      txs: body.toTxBlobData(),
    });

    const endSpongeBlob = startSpongeBlob.clone();
    await endSpongeBlob.absorb(blockBlobFields);
    const spongeBlobHash = await endSpongeBlob.squeeze();

    const header = BlockHeader.from({
      lastArchive,
      state: endState,
      spongeBlobHash,
      globalVariables,
      totalFees,
      totalManaUsed,
    });

    return { header, body, blockBlobFields };
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
  const txHeader = tx.data.constants.anchorBlockHeader;
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

export function toProofData<T extends Bufferable, PROOF_LENGTH extends number>(
  { inputs, proof, verificationKey }: PublicInputsAndRecursiveProof<T, PROOF_LENGTH>,
  vkIndex?: number,
) {
  const leafIndex = vkIndex || getVKIndex(verificationKey.keyAsFields);
  const vkData = new VkData(verificationKey, leafIndex, getVKSiblingPath(leafIndex));
  return new ProofData(inputs, proof, vkData);
}
