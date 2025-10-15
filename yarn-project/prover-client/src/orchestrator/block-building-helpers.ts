import { BatchedBlob, BatchedBlobAccumulator, Blob, SpongeBlob } from '@aztec/blob-lib';
import {
  ARCHIVE_HEIGHT,
  CIVC_PROOF_LENGTH,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256ToField, sha256Trunc } from '@aztec/foundation/crypto';
import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { type Bufferable, type Tuple, assertLength, toFriendlyJSON } from '@aztec/foundation/serialize';
import {
  MembershipWitness,
  MerkleTreeCalculator,
  computeCompressedUnbalancedMerkleTreeRoot,
} from '@aztec/foundation/trees';
import { getVkData } from '@aztec/noir-protocol-circuits-types/server/vks';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { Body, L2BlockHeader, getBlockBlobFields } from '@aztec/stdlib/block';
import type { MerkleTreeWriteOperations, PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import { Proof, ProofData, RecursiveProof } from '@aztec/stdlib/proofs';
import {
  BlockConstantData,
  BlockRollupPublicInputs,
  PrivateBaseRollupHints,
  PublicBaseRollupHints,
  PublicTubePrivateInputs,
  TreeSnapshotDiffHints,
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
      newSubtreeSiblingPath: nullifiersSubtreeRootSiblingPath,
      sortedNewLeaves: sortedNullifiers,
      sortedNewLeavesIndexes,
    } = await db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      padArrayEnd(tx.txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );

    if (nullifierWitnessLeaves === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }

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
      if (
        txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses.length > 1 ||
        txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages.length > 1 ||
        txPublicDataUpdateRequestInfo.publicDataWritesSiblingPaths.length > 1
      ) {
        throw new Error(`More than one public data write in a private only tx`);
      }

      // Get hints for reading fee payer's balance in the public data tree.
      const feePayerBalanceMembershipWitness = txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses[0];
      const feePayerBalanceLeafPreimage = txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages[0];
      const leafSlot = await computeFeePayerBalanceLeafSlot(tx.data.feePayer);
      if (!feePayerBalanceMembershipWitness || !leafSlot.equals(feePayerBalanceLeafPreimage?.leaf.slot)) {
        throw new Error(`Cannot find the public data tree leaf for the fee payer's balance`);
      }

      // Extract witness objects from returned data
      const nullifierPredecessorMembershipWitnessesWithoutPadding: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>[] =
        nullifierWitnessLeaves.map(l =>
          MembershipWitness.fromBufferArray(
            l.index,
            assertLength(l.siblingPath.toBufferArray(), NULLIFIER_TREE_HEIGHT),
          ),
        );

      const treeSnapshotDiffHints = TreeSnapshotDiffHints.from({
        noteHashSubtreeRootSiblingPath,
        nullifierPredecessorPreimages: padArrayEnd(
          nullifierWitnessLeaves.map(l => l.leafPreimage as NullifierLeafPreimage),
          NullifierLeafPreimage.empty(),
          MAX_NULLIFIERS_PER_TX,
        ),
        nullifierPredecessorMembershipWitnesses: makeTuple(MAX_NULLIFIERS_PER_TX, i =>
          i < nullifierPredecessorMembershipWitnessesWithoutPadding.length
            ? nullifierPredecessorMembershipWitnessesWithoutPadding[i]
            : makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
        ),
        sortedNullifiers: assertLength(
          sortedNullifiers.map(n => Fr.fromBuffer(n)),
          MAX_NULLIFIERS_PER_TX,
        ),
        sortedNullifierIndexes: assertLength(sortedNewLeavesIndexes, MAX_NULLIFIERS_PER_TX),
        nullifierSubtreeRootSiblingPath: assertLength(
          nullifiersSubtreeRootSiblingPath.toFields(),
          NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
        ),
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

export function getCivcProofFromTx(tx: Tx | ProcessedTx) {
  const proofFields = tx.clientIvcProof.proof;
  const numPublicInputs = proofFields.length - CIVC_PROOF_LENGTH;
  const binaryProof = new Proof(Buffer.concat(proofFields.map(field => field.toBuffer())), numPublicInputs);
  const proofFieldsWithoutPublicInputs = proofFields.slice(numPublicInputs);
  return new RecursiveProof(proofFieldsWithoutPublicInputs, binaryProof, true, CIVC_PROOF_LENGTH);
}

export function getPublicTubePrivateInputsFromTx(tx: Tx | ProcessedTx, proverId: Fr) {
  const proofData = new ProofData(
    tx.data.toPrivateToPublicKernelCircuitPublicInputs(),
    getCivcProofFromTx(tx),
    getVkData('HidingKernelToPublic'),
  );
  return new PublicTubePrivateInputs(proofData, proverId);
}

// Build "hints" as the private inputs for the checkpoint root rollup circuit.
// The `blobCommitments` will be accumulated and checked in the root rollup against the `finalBlobChallenges`.
// The `blobsHash` will be validated on L1 against the blob fields.
export const buildBlobHints = runInSpan(
  'BlockBuilderHelpers',
  'buildBlobHints',
  async (_span: Span, blobFields: Fr[]) => {
    const blobs = await Blob.getBlobsPerBlock(blobFields);
    // TODO(#13430): The blobsHash is confusingly similar to blobCommitmentsHash, calculated from below blobCommitments:
    // - blobsHash := sha256([blobhash_0, ..., blobhash_m]) = a hash of all blob hashes in a block with m+1 blobs inserted into the header, exists so a user can cross check blobs.
    // - blobCommitmentsHash := sha256( ...sha256(sha256(C_0), C_1) ... C_n) = iteratively calculated hash of all blob commitments in an epoch with n+1 blobs (see calculateBlobCommitmentsHash()),
    //   exists so we can validate injected commitments to the rollup circuits correspond to the correct real blobs.
    // We may be able to combine these values e.g. blobCommitmentsHash := sha256( ...sha256(sha256(blobshash_0), blobshash_1) ... blobshash_l) for an epoch with l+1 blocks.
    const blobCommitments = blobs.map(b => BLS12Point.decompress(b.commitment));
    const blobsHash = new Fr(getBlobsHashFromBlobs(blobs));
    return { blobCommitments, blobs, blobsHash };
  },
);

// Build the data required to prove the txs in an epoch. Currently only used in tests.
export const buildBlobDataFromTxs = async (txsPerCheckpoint: ProcessedTx[][]) => {
  const blobFields = txsPerCheckpoint.map(txs => getBlockBlobFields(txs.map(tx => tx.txEffect)));
  const finalBlobChallenges = await buildFinalBlobChallenges(blobFields);
  return { blobFieldsLengths: blobFields.map(fields => fields.length), finalBlobChallenges };
};

export const buildFinalBlobChallenges = async (blobFieldsPerCheckpoint: Fr[][]) => {
  const blobs = await Promise.all(blobFieldsPerCheckpoint.map(blobFields => Blob.getBlobsPerBlock(blobFields)));
  return await BatchedBlob.precomputeBatchedBlobChallenges(blobs.flat());
};

export const accumulateBlobs = runInSpan(
  'BlockBuilderHelpers',
  'accumulateBlobs',
  async (_span: Span, blobFields: Fr[], startBlobAccumulator: BatchedBlobAccumulator) => {
    const blobs = await Blob.getBlobsPerBlock(blobFields);
    const endBlobAccumulator = startBlobAccumulator.accumulateBlobs(blobs);
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
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    db: MerkleTreeReadOperations,
    startSpongeBlob?: SpongeBlob,
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

    const txOutHashes = txEffects.map(tx => tx.txOutHash());
    const outHash = txOutHashes.length === 0 ? Fr.ZERO : new Fr(computeCompressedUnbalancedMerkleTreeRoot(txOutHashes));

    const parityShaRoot = await computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const blobFields = body.toBlobFields();
    const blobsHash = getBlobsHashFromBlobs(await Blob.getBlobsPerBlock(blobFields));

    const contentCommitment = new ContentCommitment(blobsHash, parityShaRoot, outHash);

    const fees = txEffects.reduce((acc, tx) => acc.add(tx.transactionFee), Fr.ZERO);
    const manaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.billedGas.l2Gas)), Fr.ZERO);

    const endSpongeBlob = startSpongeBlob?.clone() ?? SpongeBlob.init(blobFields.length);
    await endSpongeBlob.absorb(blobFields);
    const spongeBlobHash = await endSpongeBlob.squeeze();

    const header = new L2BlockHeader(
      previousArchive,
      contentCommitment,
      stateReference,
      globalVariables,
      fees,
      manaUsed,
      spongeBlobHash,
    );

    return { header, body };
  },
);

export const buildBlockHeaderFromTxs = runInSpan(
  'BlockBuilderHelpers',
  'buildBlockHeaderFromTxs',
  async (
    span,
    txs: ProcessedTx[],
    globalVariables: GlobalVariables,
    startSpongeBlob: SpongeBlob,
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

    const blobFields = getBlockBlobFields(txs.map(tx => tx.txEffect));
    const endSpongeBlob = startSpongeBlob.clone();
    await endSpongeBlob.absorb(blobFields);
    const spongeBlobHash = await endSpongeBlob.squeeze();

    const txEffects = txs.map(tx => tx.txEffect);
    const fees = txEffects.reduce((acc, tx) => acc.add(tx.transactionFee), Fr.ZERO);
    const manaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.billedGas.l2Gas)), Fr.ZERO);

    return new BlockHeader(previousArchive, stateReference, spongeBlobHash, globalVariables, fees, manaUsed);
  },
);

/** Computes the inHash for a block's ContentCommitment given its l1 to l2 messages. */
export async function computeInHashFromL1ToL2Messages(unpaddedL1ToL2Messages: Fr[]): Promise<Fr> {
  const l1ToL2Messages = padArrayEnd(unpaddedL1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  const hasher = (left: Buffer, right: Buffer) =>
    Promise.resolve(sha256Trunc(Buffer.concat([left, right])) as Buffer<ArrayBuffer>);
  const parityHeight = Math.ceil(Math.log2(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP));
  const parityCalculator = await MerkleTreeCalculator.create(parityHeight, Fr.ZERO.toBuffer(), hasher);
  return new Fr(await parityCalculator.computeTreeRoot(l1ToL2Messages.map(msg => msg.toBuffer())));
}

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
