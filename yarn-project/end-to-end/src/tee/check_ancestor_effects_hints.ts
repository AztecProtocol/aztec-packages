import { SpongeBlob } from '@aztec/blob-lib';
import { type BlockBlobData, encodeBlockBlobData } from '@aztec/blob-lib/encoding';
import type { ARCHIVE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { MembershipWitness, computeRootFromSiblingPath } from '@aztec/foundation/trees';
import { BlockHash } from '@aztec/stdlib/block';
import type { TxEffect } from '@aztec/stdlib/tx';

import type { AncestorEffectsHints } from './types.js';

/**
 * Verifies that the given tx effects belong to a block that is an ancestor of the anchor block.
 * Throws if any verification step fails.
 *
 * The verification chain:
 * 1. anchorBlockHeader hashes to anchorBlockHash
 * 2. txBlockHeader's hash is in the archive tree (rooted at anchorBlockHeader.lastArchive.root)
 * 3. previousBlockHeader is authenticated (archive membership against the same anchor) and is the immediate
 *    predecessor of the target (blockNumber + 1 == target). Then "is first in checkpoint" is derived by comparing
 *    slotNumbers — same slot ⇒ same checkpoint (squeeze the sponge clone and check against prev.spongeBlobHash);
 *    different slot ⇒ different checkpoint (require prevSponge == SpongeBlob.init()).
 * 4. Absorbing the block's tx effects + block end data into the authenticated previousBlockEndSpongeBlob and
 *    squeezing yields txBlockHeader.spongeBlobHash.
 * 5. The provided effects match the tx at txIndexInBlock in the block body.
 */
export async function checkAncestorEffectsHints(
  effects: TxEffect,
  hints: AncestorEffectsHints,
  anchorBlockHash: BlockHash,
): Promise<void> {
  // 1. Verify anchor block header hashes to the claimed anchor block hash
  const computedAnchorHash = await hints.anchorBlockHeader.hash();
  if (!computedAnchorHash.equals(anchorBlockHash)) {
    throw new Error(`Anchor block header hash mismatch: computed ${computedAnchorHash}, expected ${anchorBlockHash}`);
  }
  const archiveRoot = hints.anchorBlockHeader.lastArchive.root;

  await verifyTxBlockMembership(hints, archiveRoot, anchorBlockHash);
  await verifyTxEffectsFromHints(effects, hints, archiveRoot);
}

/**
 * Verifies tx effects against an archive root directly. This is used by L1 finalization:
 * the TEE signs the archive root, so the committed initiation tx must be proven under
 * that exact root rather than under an unsigned fresh block hash.
 */
export async function checkAncestorEffectsHintsAtArchiveRoot(
  effects: TxEffect,
  hints: AncestorEffectsHints,
  archiveRoot: Fr,
): Promise<void> {
  await verifyTxBlockMembership(hints, archiveRoot);
  await verifyTxEffectsFromHints(effects, hints, archiveRoot);
}

/**
 * Verifies the tx block is committed to `archiveRoot`. When an anchor block hash
 * is signed separately, equality with that hash is enough; when only the archive
 * root is signed, callers must provide an actual archive membership witness.
 */
async function verifyTxBlockMembership(
  hints: AncestorEffectsHints,
  archiveRoot: Fr,
  anchorBlockHash?: BlockHash,
): Promise<void> {
  const txBlockHash = await hints.txBlockHeader.hash();
  if (anchorBlockHash?.equals(txBlockHash)) {
    return;
  }
  if (!hints.archiveMembershipWitness) {
    throw new Error('Missing archive membership witness for tx block');
  }
  await verifyArchiveMembership(txBlockHash.toBuffer(), hints.archiveMembershipWitness, archiveRoot, 'tx block');
}

async function verifyTxEffectsFromHints(
  effects: TxEffect,
  hints: AncestorEffectsHints,
  archiveRoot: Fr,
): Promise<void> {
  const isFirstBlockInCheckpoint = await verifyPreviousBlockEndSponge(hints, archiveRoot);

  const blockBlobData = buildBlockBlobData(hints, isFirstBlockInCheckpoint);
  const blockBlobFields = encodeBlockBlobData(blockBlobData);
  const sponge = hints.previousBlockEndSpongeBlob.clone();
  await sponge.absorb(blockBlobFields);
  const computedSpongeBlobHash = await sponge.squeeze();
  if (!computedSpongeBlobHash.equals(hints.txBlockHeader.spongeBlobHash)) {
    throw new Error(
      `Sponge blob hash mismatch: computed ${computedSpongeBlobHash}, ` +
        `expected ${hints.txBlockHeader.spongeBlobHash}`,
    );
  }

  if (hints.txIndexInBlock < 0 || hints.txIndexInBlock >= hints.blockTxEffects.length) {
    throw new Error(`txIndexInBlock ${hints.txIndexInBlock} is out of range [0, ${hints.blockTxEffects.length})`);
  }
  const blockEffect = hints.blockTxEffects[hints.txIndexInBlock];
  if (!blockEffect.equals(effects)) {
    throw new Error(`Tx effects at index ${hints.txIndexInBlock} in the block do not match the provided effects`);
  }
}

/**
 * Authenticates the previous-block-end sponge state and returns whether the target is first in its checkpoint
 * (derived from slot comparison, to avoid trusting an attacker-provided flag).
 */
async function verifyPreviousBlockEndSponge(hints: AncestorEffectsHints, archiveRoot: Fr): Promise<boolean> {
  // Authenticate the previous block header via archive membership against the same anchor.
  const previousBlockHash = await hints.previousBlockHeader.hash();
  await verifyArchiveMembership(
    previousBlockHash.toBuffer(),
    hints.previousBlockArchiveMembershipWitness,
    archiveRoot,
    'previous block',
  );

  // Previous block must be the immediate predecessor by block number.
  const prevBlockNumber = hints.previousBlockHeader.getBlockNumber();
  const txBlockNumber = hints.txBlockHeader.getBlockNumber();
  if (prevBlockNumber + 1 !== txBlockNumber) {
    throw new Error(
      `Previous block is not the immediate predecessor: prev blockNumber ${prevBlockNumber} + 1 !== target blockNumber ${txBlockNumber}`,
    );
  }

  // Derive is-first-in-checkpoint from slot comparison (each checkpoint has a unique slot).
  const prevSlot = hints.previousBlockHeader.globalVariables.slotNumber;
  const targetSlot = hints.txBlockHeader.globalVariables.slotNumber;
  const isFirstBlockInCheckpoint = prevSlot !== targetSlot;

  if (isFirstBlockInCheckpoint) {
    // Previous block is in a different checkpoint (different slot) ⇒ sponge was re-initialized.
    const initSpongeBuffer = SpongeBlob.init().toBuffer();
    if (!hints.previousBlockEndSpongeBlob.toBuffer().equals(initSpongeBuffer)) {
      throw new Error(
        `First block in checkpoint (prev slot ${prevSlot} differs from target slot ${targetSlot}): ` +
          `previousBlockEndSpongeBlob must equal SpongeBlob.init()`,
      );
    }
  } else {
    // Same checkpoint ⇒ the sponge must squeeze to the previous block's published spongeBlobHash.
    // This is the core soundness check — without it, the attacker could forge any sponge state.
    const squeezed = await hints.previousBlockEndSpongeBlob.clone().squeeze();
    if (!squeezed.equals(hints.previousBlockHeader.spongeBlobHash)) {
      throw new Error(
        `previousBlockEndSpongeBlob does not squeeze to previousBlockHeader.spongeBlobHash: ` +
          `computed ${squeezed}, expected ${hints.previousBlockHeader.spongeBlobHash}`,
      );
    }
  }

  return isFirstBlockInCheckpoint;
}

/** Verifies a Merkle membership proof against the given root. */
export async function verifyArchiveMembership(
  leaf: Buffer,
  witness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
  expectedRoot: Fr,
  label: string,
): Promise<void> {
  const { leafIndex, siblingPath } = witness;
  const computedRoot = await computeRootFromSiblingPath(
    leaf,
    siblingPath.map(f => f.toBuffer()),
    Number(leafIndex),
  );
  if (!Fr.fromBuffer(computedRoot).equals(expectedRoot)) {
    throw new Error(`Archive membership witness verification failed for ${label}`);
  }
}

/**
 * Reconstructs BlockBlobData from the hints, matching the logic in L2Block.toBlockBlobData().
 * The 6-vs-7-field block end is determined by whether the target is first in its checkpoint.
 */
function buildBlockBlobData(hints: AncestorEffectsHints, isFirstBlockInCheckpoint: boolean): BlockBlobData {
  const header = hints.txBlockHeader;
  return {
    blockEndMarker: {
      numTxs: hints.blockTxEffects.length,
      timestamp: header.globalVariables.timestamp,
      blockNumber: header.getBlockNumber(),
    },
    blockEndStateField: {
      l1ToL2MessageNextAvailableLeafIndex: header.state.l1ToL2MessageTree.nextAvailableLeafIndex,
      noteHashNextAvailableLeafIndex: header.state.partial.noteHashTree.nextAvailableLeafIndex,
      nullifierNextAvailableLeafIndex: header.state.partial.nullifierTree.nextAvailableLeafIndex,
      publicDataNextAvailableLeafIndex: header.state.partial.publicDataTree.nextAvailableLeafIndex,
      totalManaUsed: header.totalManaUsed.toBigInt(),
    },
    lastArchiveRoot: header.lastArchive.root,
    noteHashRoot: header.state.partial.noteHashTree.root,
    nullifierRoot: header.state.partial.nullifierTree.root,
    publicDataRoot: header.state.partial.publicDataTree.root,
    l1ToL2MessageRoot: isFirstBlockInCheckpoint ? header.state.l1ToL2MessageTree.root : undefined,
    txs: hints.blockTxEffects.map(tx => tx.toTxBlobData()),
  };
}
