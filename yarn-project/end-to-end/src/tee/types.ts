import { Fr } from '@aztec/aztec.js/fields';
import type { SpongeBlob } from '@aztec/blob-lib';
import type { ARCHIVE_HEIGHT } from '@aztec/constants';
import type { Tuple } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import type { BlockHeader, TxEffect } from '@aztec/stdlib/tx';

/** Hints for proving that a tx's effects are in a block that is an ancestor of a given anchor block. */
export interface AncestorEffectsHints {
  /** Header of the anchor block (verified against the given anchor block hash to extract the archive root). */
  anchorBlockHeader: BlockHeader;
  /**
   * Merkle proof that the tx block's hash is a leaf in anchorBlockHeader.lastArchive.
   * Undefined when the tx block IS the anchor block (equality check replaces archive membership).
   */
  archiveMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined;
  /** Header of the block containing the target tx. */
  txBlockHeader: BlockHeader;
  /**
   * Sponge state absorbed into by the target block. Authenticated by the checker via one of:
   * - squeeze check against previousBlockHeader.spongeBlobHash (when prev is in the same checkpoint)
   * - structural equality with SpongeBlob.init() (when prev is in a different checkpoint)
   */
  previousBlockEndSpongeBlob: SpongeBlob;
  /** Header of the block immediately preceding the target in block order. */
  previousBlockHeader: BlockHeader;
  /** Merkle proof that previousBlockHeader's hash is a leaf in anchorBlockHeader.lastArchive. */
  previousBlockArchiveMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>;
  /** All tx effects in the target block's body, in order. */
  blockTxEffects: TxEffect[];
  /** Index of the target tx within the block's body. */
  txIndexInBlock: number;
}

export const MAX_EFFECTS = 10;
// TEE-side caps on the bridge primitives we accept per TokenOperation. Not part of the
// signed preimage today (Noir side still verifies the 5-field shape); these bound how
// many deposits / exits a caller may assert off-chain.
export const MAX_DEPOSITS = 1;
export const MAX_EXITS = 1;

/**
 * Domain separator for TEE signatures. Prepended to the signed preimage so a
 * signature produced for a note attestation cannot be reused as an exit
 * attestation (or vice versa) even if the remaining fields collide.
 */
export enum TeeSigDomain {
  NOTE = 0,
  EXIT = 1,
}

/**
 * Preimage the TEE signs per (created-note | exit-message) in a TokenOperation.
 *
 * The `signedCommitment` slot carries a siloed note hash for a per-note signature,
 * or an L2->L1 message hash for a per-exit signature. `exitMessageHashes` is the
 * full padded set of exits the operation produces, so every signature (note or exit)
 * binds to the same exit set - a verifier rebuilding the preimage from DA must
 * recover this array too. `domain` separates the two signature types so they
 * cannot be cross-used.
 */
export class TeeSignedData {
  constructor(
    public readonly domain: TeeSigDomain,
    public readonly anchorBlockHash: BlockHash,
    public readonly tokenAddress: AztecAddress,
    public readonly signedCommitment: Fr,
    public readonly requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>,
    public readonly committedSiloedNoteHashes: Tuple<Fr, typeof MAX_EFFECTS>,
    public readonly exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>,
  ) {}

  toFields(): Fr[] {
    return [
      new Fr(this.domain),
      this.anchorBlockHash.toField(),
      this.tokenAddress.toField(),
      this.signedCommitment,
      ...this.requiredNullifiers,
      ...this.committedSiloedNoteHashes,
      ...this.exitMessageHashes,
    ];
  }
}

export class TEEMetadata {
  constructor(
    public readonly pubKeyX: Fr,
    public readonly pubKeyY: Fr,
    public readonly anchorBlockHash: BlockHash,
  ) {}

  toFields(): Fr[] {
    return [this.pubKeyX, this.pubKeyY, this.anchorBlockHash.toField()];
  }
}
