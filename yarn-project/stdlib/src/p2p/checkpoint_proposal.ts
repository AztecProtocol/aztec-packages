import {
  type CheckpointNumber,
  CheckpointProposalHash,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { type BaseBuffer32, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeSignedBigInt, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TypedDataDefinition } from 'viem';

import type { L2BlockInfo } from '../block/l2_block_info.js';
import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { DutyType, type SigningContext } from '../ha-signing/index.js';
import { InboxBucketRef } from '../messaging/inbox_bucket.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/index.js';
import type { Tx } from '../tx/tx.js';
import { BlockProposal } from './block_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
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

export type { CheckpointProposalHash } from '@aztec/foundation/branded-types';

export type CheckpointProposalOptions = {
  /**
   * Whether to include the tx objects along with the block proposal.
   * Dramatically increases size of the payload but eliminates failed reexecutions due to missing txs.
   */
  publishFullTxs?: boolean;
  /**
   * Whether to generate an invalid checkpoint proposal for broadcasting.
   * Use only for testing.
   */
  broadcastInvalidCheckpointProposal?: boolean;
};

/** Data for the last block included in a checkpoint proposal */
export type CheckpointLastBlockData = {
  /** The per-block header for the last block in the checkpoint */
  blockHeader: BlockHeader;
  /** Index of this block within the checkpoint (should be the last index, e.g., numBlocks - 1) */
  indexWithinCheckpoint: IndexWithinCheckpoint;
  /** The sequence of transactions in the last block */
  txHashes: TxHash[];
  /** The tx in the last block (optional, for DA guarantees) */
  txs?: Tx[];
};

/** Last block included in a checkpoint proposal */
export type CheckpointLastBlock = Omit<CheckpointLastBlockData, 'txs'> & {
  /** The proposer's signature over the block data (separate from checkpoint signature) */
  signature: Signature;
  /** The signed transactions in the last block (optional, for DA guarantees) */
  signedTxs?: SignedTxs;
  /**
   * Reference to the Inbox bucket the last block proposes to consume. When set, its rolling hash must equal the
   * checkpoint header's `inboxRollingHash` (enforced at construction).
   */
  bucketRef?: InboxBucketRef;
};

/**
 * A checkpoint proposal is created by the leader of the chain for the last block in a checkpoint.
 * It includes the aggregated checkpoint header that validators will attest to, plus optionally
 * the last block's info for nodes to re-execute. This marks the completion of a slot's worth of blocks.
 */
export class CheckpointProposal extends Gossipable implements Signable {
  static override p2pTopic = TopicType.checkpoint_proposal;

  readonly primaryType: CoordinationSignatureType = 'CheckpointProposal';

  private cachedSender: EthAddress | undefined | null = undefined;

  constructor(
    /** The aggregated checkpoint header for consensus */
    public readonly checkpointHeader: CheckpointHeader,

    /** Archive root after this checkpoint is applied */
    public readonly archive: Fr,

    /** The fee asset price modifier in basis points (from oracle) */
    public readonly feeAssetPriceModifier: bigint,

    /** The proposer's signature over the checkpoint payload (checkpointHeader + archive + feeAssetPriceModifier) */
    public readonly signature: Signature,

    /** The signing domain (chainId + rollupAddress) the signature is bound to */
    public readonly signatureContext: CoordinationSignatureContext,

    /** Optional last block info, including its own signature for BlockProposal extraction */
    public readonly lastBlock?: CheckpointLastBlock | BlockProposal,
  ) {
    super();

    // Check that last block properties match those of the checkpoint. The last block's bucket reference (AZIP-22 Fast
    // Inbox) commits to the same rolling hash as the checkpoint header. Only enforced when the reference is set.
    if (lastBlock?.bucketRef && !lastBlock.bucketRef.inboxRollingHash.equals(checkpointHeader.inboxRollingHash)) {
      throw new Error(
        `CheckpointProposal lastBlock bucketRef rolling hash ${lastBlock.bucketRef.inboxRollingHash} does not match checkpoint inboxRollingHash ${checkpointHeader.inboxRollingHash}`,
      );
    }
    if (lastBlock && 'archiveRoot' in lastBlock && !lastBlock.archiveRoot.equals(archive)) {
      throw new Error(
        `CheckpointProposal lastBlock archive ${lastBlock.archiveRoot} does not match checkpoint archive ${archive}`,
      );
    }
    if (
      lastBlock &&
      'signatureContext' in lastBlock &&
      !coordinationSignatureContextEquals(lastBlock.signatureContext, signatureContext)
    ) {
      throw new Error(`CheckpointProposal lastBlock signatureContext does not match checkpoint signatureContext`);
    }
  }

  override generateP2PMessageIdentifier(): Promise<BaseBuffer32> {
    return Promise.resolve(new Buffer32(this.toConsensusPayload().getPayloadHash()));
  }

  get slotNumber(): SlotNumber {
    return this.checkpointHeader.slotNumber;
  }

  /**
   * Extract a BlockProposal from the last block info.
   */
  getBlockProposal(): BlockProposal | undefined {
    if (!this.lastBlock) {
      return undefined;
    }

    return new BlockProposal(
      this.lastBlock.blockHeader,
      this.lastBlock.indexWithinCheckpoint,
      this.archive,
      this.lastBlock.txHashes,
      this.lastBlock.signature,
      this.signatureContext,
      this.lastBlock.signedTxs,
      this.lastBlock.bucketRef,
    );
  }

  toBlockInfo(): Omit<L2BlockInfo, 'blockNumber'> {
    if (!this.lastBlock) {
      throw new Error('Cannot get blockInfo without lastBlock');
    }
    return {
      slotNumber: this.slotNumber,
      lastArchive: this.lastBlock.blockHeader.lastArchive.root,
      timestamp: this.lastBlock.blockHeader.globalVariables.timestamp,
      archive: this.archive,
      txCount: this.lastBlock.txHashes.length,
    };
  }

  toCheckpointInfo() {
    return {
      slotNumber: this.slotNumber,
      archive: this.archive,
      lastBlockNumber: this.lastBlock?.blockHeader.getBlockNumber(),
      lastBlockIndex: this.lastBlock?.indexWithinCheckpoint,
      blockHeadersHash: this.checkpointHeader.blockHeadersHash,
    };
  }

  /**
   * Get the payload to sign for this checkpoint proposal.
   * The signature is over the checkpoint header + archive root + feeAssetPriceModifier (for consensus).
   */
  getPayloadToSign(): Buffer {
    return serializeToBuffer([this.checkpointHeader, this.archive, serializeSignedBigInt(this.feeAssetPriceModifier)]);
  }

  /**
   * Returns a content-addressed keccak256 hash of the consensus payload
   * (header + archive + feeAssetPriceModifier + signatureContext).
   *
   * Used by the attestation pool to dedup distinct signed payloads at the same slot
   * regardless of archive/header collisions on `feeAssetPriceModifier` variants.
   * The hash deliberately excludes the signature so non-deterministic ECDSA
   * re-signs of the same payload do not look like equivocation.
   */
  getPayloadHash(): CheckpointProposalHash {
    return CheckpointProposalHash.fromBuffer(this.toConsensusPayload().getPayloadHash());
  }

  /** Returns the ConsensusPayload that an attester would sign for this proposal. */
  toConsensusPayload(): ConsensusPayload {
    return new ConsensusPayload(this.checkpointHeader, this.archive, this.feeAssetPriceModifier, this.signatureContext);
  }

  static async createProposalFromSigner(
    checkpointHeader: CheckpointHeader,
    archiveRoot: Fr,
    checkpointNumber: CheckpointNumber,
    feeAssetPriceModifier: bigint,
    lastBlockProposal: BlockProposal | undefined,
    signatureContext: CoordinationSignatureContext,
    payloadSigner: (typedData: TypedDataDefinition, context: SigningContext) => Promise<Signature>,
  ): Promise<CheckpointProposal> {
    // Sign the checkpoint payload with CHECKPOINT_PROPOSAL duty type
    const tempProposal = new CheckpointProposal(
      checkpointHeader,
      archiveRoot,
      feeAssetPriceModifier,
      Signature.empty(),
      signatureContext,
    );
    const checkpointContext: SigningContext = {
      slot: checkpointHeader.slotNumber,
      checkpointNumber,
      dutyType: DutyType.CHECKPOINT_PROPOSAL,
    };

    const typedData = getCoordinationSignatureTypedData(tempProposal);
    const checkpointSignature = await payloadSigner(typedData, checkpointContext);

    return new CheckpointProposal(
      checkpointHeader,
      archiveRoot,
      feeAssetPriceModifier,
      checkpointSignature,
      signatureContext,
      lastBlockProposal,
    );
  }

  /**
   * Lazily evaluate the sender of the proposal; result is cached.
   * If there's a lastBlock, also verifies the block proposal sender matches the checkpoint sender.
   * @returns The sender address, or undefined if signature recovery fails or senders don't match
   */
  getSender(): EthAddress | undefined {
    if (this.cachedSender === undefined) {
      const checkpointSender = recoverCoordinationSigner(this, this.signature);

      if (checkpointSender && this.lastBlock) {
        const blockProposal = this.getBlockProposal();
        const blockSender = blockProposal?.getSender();
        if (!blockSender || !blockSender.equals(checkpointSender)) {
          this.cachedSender = null;
          return undefined;
        }
      }

      this.cachedSender = checkpointSender ?? null;
    }

    return this.cachedSender ?? undefined;
  }

  getPayload() {
    return this.getPayloadToSign();
  }

  toBuffer(): Buffer {
    const buffer: any[] = [
      this.checkpointHeader,
      this.archive,
      serializeSignedBigInt(this.feeAssetPriceModifier),
      this.signature,
      serializeCoordinationSignatureContext(this.signatureContext),
    ];

    if (this.lastBlock) {
      buffer.push(1); // hasLastBlock = true
      buffer.push(this.lastBlock.blockHeader);
      buffer.push(this.lastBlock.indexWithinCheckpoint);
      buffer.push(this.lastBlock.signature);
      buffer.push(this.lastBlock.txHashes.length);
      buffer.push(this.lastBlock.txHashes);
      if (this.lastBlock.signedTxs) {
        buffer.push(1); // hasSignedTxs = true
        buffer.push(this.lastBlock.signedTxs.toBuffer());
      } else {
        buffer.push(0); // hasSignedTxs = false
      }
      // Optional bucket-reference tail (AZIP-22 Fast Inbox). Appended only when set, so pre-flip proposals serialize
      // byte-identically to the legacy format and mixed-version peers keep decoding them.
      if (this.lastBlock.bucketRef) {
        buffer.push(1); // hasBucketRef = true
        buffer.push(this.lastBlock.bucketRef.toBuffer());
      }
    } else {
      buffer.push(0); // hasLastBlock = false
    }

    return serializeToBuffer(buffer);
  }

  static fromBuffer(buf: Buffer | BufferReader): CheckpointProposal {
    const reader = BufferReader.asReader(buf);

    const checkpointHeader = reader.readObject(CheckpointHeader);
    const archive = reader.readObject(Fr);
    const feeAssetPriceModifier = reader.readInt256();
    const signature = reader.readObject(Signature);
    const signatureContext = readCoordinationSignatureContext(reader);

    const hasLastBlock = reader.readNumber();

    if (hasLastBlock) {
      const blockHeader = reader.readObject(BlockHeader);
      const indexWithinCheckpoint = IndexWithinCheckpoint(reader.readNumber());
      const blockSignature = reader.readObject(Signature);
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
      // decodes as "no reference" — the cross-version tolerance that keeps mixed-version gossip working.
      let bucketRef: InboxBucketRef | undefined;
      if (!reader.isEmpty()) {
        const hasBucketRef = reader.readNumber();
        if (hasBucketRef) {
          bucketRef = InboxBucketRef.fromBuffer(reader);
        }
      }

      return new CheckpointProposal(checkpointHeader, archive, feeAssetPriceModifier, signature, signatureContext, {
        blockHeader,
        indexWithinCheckpoint,
        txHashes,
        signature: blockSignature,
        signedTxs,
        bucketRef,
      });
    }

    return new CheckpointProposal(checkpointHeader, archive, feeAssetPriceModifier, signature, signatureContext);
  }

  getSize(): number {
    let size =
      this.checkpointHeader.toBuffer().length +
      this.archive.size +
      this.signature.getSize() +
      8 /* feeAssetPriceModifier */ +
      4 /* chainId */ +
      20 /* rollupAddress */ +
      4; /* hasLastBlock flag */

    if (this.lastBlock) {
      size +=
        this.lastBlock.blockHeader.getSize() +
        4 /* indexWithinCheckpoint */ +
        this.lastBlock.signature.getSize() +
        4 /* txHashes.length */ +
        this.lastBlock.txHashes.length * TxHash.SIZE +
        4 /* hasSignedTxs flag */ +
        (this.lastBlock.signedTxs ? this.lastBlock.signedTxs.getSize() : 0) +
        (this.lastBlock.bucketRef ? 4 /* hasBucketRef flag */ + this.lastBlock.bucketRef.getSize() : 0);
    }

    return size;
  }

  static empty(): CheckpointProposal {
    return new CheckpointProposal(
      CheckpointHeader.empty(),
      Fr.ZERO,
      0n,
      Signature.empty(),
      EMPTY_COORDINATION_SIGNATURE_CONTEXT,
    );
  }

  static random(): CheckpointProposal {
    return new CheckpointProposal(
      CheckpointHeader.random(),
      Fr.random(),
      0n,
      Signature.random(),
      EMPTY_COORDINATION_SIGNATURE_CONTEXT,
      {
        blockHeader: BlockHeader.random(),
        indexWithinCheckpoint: IndexWithinCheckpoint(Math.floor(Math.random() * 5)),
        txHashes: [TxHash.random(), TxHash.random()],
        signature: Signature.random(),
      },
    );
  }

  toInspect() {
    return {
      checkpointHeader: this.checkpointHeader.toInspect(),
      archive: this.archive.toString(),
      signature: this.signature.toString(),
      feeAssetPriceModifier: this.feeAssetPriceModifier.toString(),
      chainId: this.signatureContext.chainId,
      rollupAddress: this.signatureContext.rollupAddress.toString(),
      lastBlock: this.lastBlock
        ? {
            blockHeader: this.lastBlock.blockHeader.toInspect(),
            indexWithinCheckpoint: this.lastBlock.indexWithinCheckpoint,
            txHashes: this.lastBlock.txHashes.map(h => h.toString()),
            signature: this.lastBlock.signature.toString(),
            bucketRef: this.lastBlock.bucketRef?.toInspect(),
          }
        : undefined,
    };
  }

  /**
   * Returns a copy of this proposal without lastBlock info, as a CheckpointProposalCore.
   * Used when the lastBlock has been extracted and stored separately.
   */
  toCore(): CheckpointProposalCore {
    return new CheckpointProposal(
      this.checkpointHeader,
      this.archive,
      this.feeAssetPriceModifier,
      this.signature,
      this.signatureContext,
    );
  }
}

/**
 * A checkpoint proposal without the lastBlock info.
 * Used when the lastBlock has been extracted and handled separately as a BlockProposal.
 * This type makes it clear that lastBlock and getBlockProposal() are not available.
 */
export type CheckpointProposalCore = Omit<CheckpointProposal, 'lastBlock' | 'getBlockProposal' | 'toCore'>;
