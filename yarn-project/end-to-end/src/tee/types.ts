import type { Fr } from '@aztec/aztec.js/fields';
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

export class TeeSignedData {
  constructor(
    public readonly anchorBlockHash: BlockHash,
    public readonly tokenAddress: AztecAddress,
    public readonly siloedNoteHash: Fr,
    public readonly requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>,
    public readonly committedSiloedNoteHashes: Tuple<Fr, typeof MAX_EFFECTS>,
  ) {}

  toFields(): Fr[] {
    return [
      this.anchorBlockHash.toField(),
      this.tokenAddress.toField(),
      this.siloedNoteHash,
      ...this.requiredNullifiers,
      ...this.committedSiloedNoteHashes,
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
