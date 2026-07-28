import {
  BlockNumber,
  BlockProposalHash,
  type CheckpointNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { type BaseBuffer32, Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TypedDataDefinition } from 'viem';

import type { L2Block } from '../block/l2_block.js';
import type { L2BlockInfo } from '../block/l2_block_info.js';
import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { DutyType, type SigningContext } from '../ha-signing/index.js';
import { InboxBucketRef } from '../messaging/inbox_bucket.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/index.js';
import type { Tx } from '../tx/tx.js';
import { Gossipable } from './gossipable.js';
import {
  type CoordinationSignatureContext,
  type CoordinationSignatureType,
  EMPTY_COORDINATION_SIGNATURE_CONTEXT,
  type Signable,
  coordinationSignatureContextEquals,
  getCoordinationSignatureTypedData,
  readCoordinationSignatureContext,
  recoverCoordinationSigner,
  serializeCoordinationSignatureContext,
} from './signature_utils.js';
import { SignedTxs } from './signed_txs.js';
import { TopicType } from './topic_type.js';

export type { BlockProposalHash } from '@aztec/foundation/branded-types';

export type BlockProposalOptions = {
  /**
   * Whether to include the tx objects along with the block proposal.
   * Dramatically increases size of the payload but eliminates failed reexecutions due to missing txs.
   */
  publishFullTxs?: boolean;
  /**
   * Whether to generate an invalid block proposal for broadcasting.
   * Use only for testing.
   */
  broadcastInvalidBlockProposal?: boolean;
};

/**
 * A block proposal is created by the leader of the chain proposing a sequence of transactions
 * to be included in a block within a checkpoint. This is used for non-last blocks in a slot.
 * The last block is sent as part of a CheckpointProposal.
 */
export class BlockProposal extends Gossipable implements Signable {
  static override p2pTopic = TopicType.block_proposal;

  readonly primaryType: CoordinationSignatureType = 'BlockProposal';

  private cachedSender: EthAddress | undefined | null = undefined;

  constructor(
    /** The per-block header containing block state and global variables */
    public readonly blockHeader: BlockHeader,

    /** Index of this block within the checkpoint (0-indexed) */
    public readonly indexWithinCheckpoint: IndexWithinCheckpoint,

    /** Hash of L1 to L2 messages for this checkpoint (constant across all blocks in checkpoint) */
    public readonly inHash: Fr,

    /** Archive root after this block is applied */
    public readonly archiveRoot: Fr,

    /** The sequence of transactions in the block */
    public readonly txHashes: TxHash[],

    /** The proposer's signature over the block data */
    public readonly signature: Signature,

    /** The signing domain (chainId + rollupAddress) the signature is bound to */
    public readonly signatureContext: CoordinationSignatureContext,

    /** The signed transactions in the block (optional, for DA guarantees) */
    public readonly signedTxs?: SignedTxs,

    /**
     * Reference to the Inbox bucket this block proposes to consume, when the proposer commits to one. Validators
     * resolve it against their own Inbox view and derive the consumed message bundle from it rather than trusting a
     * proposer-supplied message list. Covered by the proposal signature (part of `getPayloadToSign`).
     */
    public readonly bucketRef?: InboxBucketRef,
  ) {
    super();
  }

  override generateP2PMessageIdentifier(): Promise<BaseBuffer32> {
    return Promise.resolve(new Buffer32(this.getPayloadHashBuffer()));
  }

  get archive(): Fr {
    return this.archiveRoot;
  }

  get slotNumber(): SlotNumber {
    return this.blockHeader.getSlot();
  }

  get blockNumber(): BlockNumber {
    return this.blockHeader.getBlockNumber();
  }

  /** Convenience getter for txs from signedTxs */
  get txs(): Tx[] | undefined {
    return this.signedTxs?.txs;
  }

  toBlockInfo(): Omit<L2BlockInfo, 'blockNumber'> {
    return {
      slotNumber: this.slotNumber,
      lastArchive: this.blockHeader.lastArchive.root,
      timestamp: this.blockHeader.globalVariables.timestamp,
      archive: this.archiveRoot,
      txCount: this.txHashes.length,
    };
  }

  /**
   * Get the payload to sign for this block proposal.
   * The signature is over: blockHeader + indexWithinCheckpoint + inHash + archiveRoot + txHashes, plus the bucket
   * reference when set. Appending only when set keeps the pre-flip signed payload byte-identical to the legacy format,
   * while binding the reference to the signature so a relay cannot strip or inject it without breaking recovery.
   */
  getPayloadToSign(): Buffer {
    return serializeToBuffer([
      this.blockHeader,
      this.indexWithinCheckpoint,
      this.inHash,
      this.archiveRoot,
      this.txHashes.length,
      this.txHashes,
      ...(this.bucketRef ? [this.bucketRef] : []),
    ]);
  }

  private getPayloadHashBuffer(): Buffer {
    return keccak256(this.getPayloadToSign());
  }

  /**
   * Returns a keccak256 hash of the signed payload.
   * Used by the attestation pool to dedup distinct signed payloads at the same
   * (slot, indexWithinCheckpoint) regardless of archive collisions.
   * The hash deliberately excludes the signature so non-deterministic ECDSA
   * re-signs of the same payload do not look like equivocation.
   */
  getPayloadHash(): BlockProposalHash {
    return BlockProposalHash.fromBuffer(this.getPayloadHashBuffer());
  }

  static async createProposalFromSigner(
    blockHeader: BlockHeader,
    checkpointNumber: CheckpointNumber,
    indexWithinCheckpoint: IndexWithinCheckpoint,
    inHash: Fr,
    archiveRoot: Fr,
    txHashes: TxHash[],
    txs: Tx[] | undefined,
    signatureContext: CoordinationSignatureContext,
    proposalSigner: (typedData: TypedDataDefinition, context: SigningContext) => Promise<Signature>,
    txsSigner?: (typedData: TypedDataDefinition, context: SigningContext) => Promise<Signature>,
    bucketRef?: InboxBucketRef,
  ): Promise<BlockProposal> {
    // Create a temporary proposal to get the payload to sign
    const tempProposal = new BlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archiveRoot,
      txHashes,
      Signature.empty(),
      signatureContext,
      undefined,
      bucketRef,
    );

    // Create the block signing context
    const blockContext: SigningContext = {
      slot: blockHeader.globalVariables.slotNumber,
      blockNumber: blockHeader.globalVariables.blockNumber,
      checkpointNumber,
      blockIndexWithinCheckpoint: indexWithinCheckpoint,
      dutyType: DutyType.BLOCK_PROPOSAL,
    };

    const typedData = getCoordinationSignatureTypedData(tempProposal);
    const sig = await proposalSigner(typedData, blockContext);

    // If txs are provided, sign them as well
    let signedTxs: SignedTxs | undefined;
    if (txs) {
      const txsSigningContext: SigningContext = { dutyType: DutyType.TXS };
      if (!txsSigner) {
        throw new Error('signed_txs requires a typed-data signer');
      }
      signedTxs = await SignedTxs.createFromSigner(txs, signatureContext, typedData =>
        txsSigner(typedData, txsSigningContext),
      );
    }

    return new BlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archiveRoot,
      txHashes,
      sig,
      signatureContext,
      signedTxs,
      bucketRef,
    );
  }

  /**
   * Lazily evaluate the sender of the proposal; result is cached.
   * If there's signedTxs, also verifies that its signing domain matches this proposal's and
   * that the signedTxs sender matches the block proposal sender. This prevents a proposer
   * from wrapping a foreign-chain SignedTxs bundle inside a local-chain proposal.
   * @returns The sender address, or undefined if signature recovery fails or inner/outer mismatch
   */
  getSender(): EthAddress | undefined {
    if (this.cachedSender === undefined) {
      const blockSender = recoverCoordinationSigner(this, this.signature);

      if (blockSender && this.signedTxs) {
        if (!coordinationSignatureContextEquals(this.signedTxs.signatureContext, this.signatureContext)) {
          this.cachedSender = null;
          return undefined;
        }
        const txsSender = this.signedTxs.getSender();
        if (!txsSender || !txsSender.equals(blockSender)) {
          this.cachedSender = null;
          return undefined;
        }
      }

      this.cachedSender = blockSender ?? null;
    }

    return this.cachedSender ?? undefined;
  }

  getPayload() {
    return this.getPayloadToSign();
  }

  toBuffer(): Buffer {
    const buffer: any[] = [
      this.blockHeader,
      this.indexWithinCheckpoint,
      this.inHash,
      this.archiveRoot,
      this.signature,
      serializeCoordinationSignatureContext(this.signatureContext),
      this.txHashes.length,
      this.txHashes,
    ];
    if (this.signedTxs) {
      buffer.push(1); // hasSignedTxs = true
      buffer.push(this.signedTxs.toBuffer());
    } else {
      buffer.push(0); // hasSignedTxs = false
    }
    // Optional bucket-reference tail (AZIP-22 Fast Inbox). Appended only when set, so pre-flip proposals serialize
    // byte-identically to the legacy format and mixed-version peers keep decoding them.
    if (this.bucketRef) {
      buffer.push(1); // hasBucketRef = true
      buffer.push(this.bucketRef.toBuffer());
    }
    return serializeToBuffer(buffer);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockProposal {
    const reader = BufferReader.asReader(buf);

    const blockHeader = reader.readObject(BlockHeader);
    const indexWithinCheckpoint = IndexWithinCheckpoint(reader.readNumber());
    const inHash = reader.readObject(Fr);
    const archiveRoot = reader.readObject(Fr);
    const signature = reader.readObject(Signature);
    const signatureContext = readCoordinationSignatureContext(reader);
    const txHashCount = reader.readNumber();
    if (txHashCount > MAX_TXS_PER_BLOCK) {
      throw new Error(`txHashes count ${txHashCount} exceeds maximum ${MAX_TXS_PER_BLOCK}`);
    }
    const txHashes = reader.readArray(txHashCount, TxHash);

    let signedTxs: SignedTxs | undefined;
    if (!reader.isEmpty()) {
      const hasSignedTxs = reader.readNumber();
      if (hasSignedTxs) {
        signedTxs = SignedTxs.fromBuffer(reader);
      }
    }

    // Optional bucket-reference tail (AZIP-22 Fast Inbox). Legacy buffers end after the signedTxs flag, so EOF here
    // decodes as "no reference" — this is the cross-version tolerance that keeps mixed-version gossip working.
    let bucketRef: InboxBucketRef | undefined;
    if (!reader.isEmpty()) {
      const hasBucketRef = reader.readNumber();
      if (hasBucketRef) {
        bucketRef = InboxBucketRef.fromBuffer(reader);
      }
    }

    return new BlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archiveRoot,
      txHashes,
      signature,
      signatureContext,
      signedTxs,
      bucketRef,
    );
  }

  getSize(): number {
    return (
      this.blockHeader.getSize() +
      4 /* indexWithinCheckpoint */ +
      this.inHash.size +
      this.archiveRoot.size +
      this.signature.getSize() +
      4 /* chainId */ +
      20 /* rollupAddress */ +
      4 /* txHashes.length */ +
      this.txHashes.length * TxHash.SIZE +
      4 /* hasSignedTxs flag */ +
      (this.signedTxs ? this.signedTxs.getSize() : 0) +
      (this.bucketRef ? 4 /* hasBucketRef flag */ + this.bucketRef.getSize() : 0)
    );
  }

  static empty(): BlockProposal {
    return new BlockProposal(
      BlockHeader.empty(),
      IndexWithinCheckpoint(0),
      Fr.ZERO,
      Fr.ZERO,
      [],
      Signature.empty(),
      EMPTY_COORDINATION_SIGNATURE_CONTEXT,
    );
  }

  static random(): BlockProposal {
    return new BlockProposal(
      BlockHeader.random(),
      IndexWithinCheckpoint(Math.floor(Math.random() * 5)),
      Fr.random(),
      Fr.random(),
      [TxHash.random(), TxHash.random()],
      Signature.random(),
      EMPTY_COORDINATION_SIGNATURE_CONTEXT,
    );
  }

  toInspect() {
    return {
      blockHeader: this.blockHeader.toInspect(),
      indexWithinCheckpoint: this.indexWithinCheckpoint,
      inHash: this.inHash.toString(),
      archiveRoot: this.archiveRoot.toString(),
      signature: this.signature.toString(),
      txHashes: this.txHashes.map(h => h.toString()),
      chainId: this.signatureContext.chainId,
      rollupAddress: this.signatureContext.rollupAddress.toString(),
      bucketRef: this.bucketRef?.toInspect(),
    };
  }

  /**
   * Check if this proposal matches the given block.
   * Compares the archive root and block header.
   * @param block - The L2Block to compare against
   * @returns True if the proposal matches the block
   */
  matchesBlock(block: L2Block): boolean {
    return this.archiveRoot.equals(block.archive.root) && this.blockHeader.equals(block.header);
  }

  /**
   * Returns a copy of this proposal without signedTxs.
   * Used when storing proposals in attestation pool to avoid storing full tx data.
   */
  withoutSignedTxs(): BlockProposal {
    return new BlockProposal(
      this.blockHeader,
      this.indexWithinCheckpoint,
      this.inHash,
      this.archiveRoot,
      this.txHashes,
      this.signature,
      this.signatureContext,
      undefined,
      this.bucketRef,
    );
  }
}
