import { BlockNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeSignedBigInt, serializeToBuffer } from '@aztec/foundation/serialize';
import { DutyType, type SigningContext } from '@aztec/validator-ha-signer/types';

import type { L2BlockInfo } from '../block/l2_block_info.js';
import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/index.js';
import type { Tx } from '../tx/tx.js';
import { BlockProposal } from './block_proposal.js';
import { Gossipable } from './gossipable.js';
import {
  SignatureDomainSeparator,
  getHashedSignaturePayload,
  getHashedSignaturePayloadEthSignedMessage,
} from './signature_utils.js';
import { SignedTxs } from './signed_txs.js';
import { TopicType } from './topic_type.js';

// REFACTOR(palla): Use a branded type instead of a subclass of Buffer32
export class CheckpointProposalHash extends Buffer32 {
  constructor(hash: Buffer) {
    super(hash);
  }
}

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
};

/**
 * A checkpoint proposal is created by the leader of the chain for the last block in a checkpoint.
 * It includes the aggregated checkpoint header that validators will attest to, plus optionally
 * the last block's info for nodes to re-execute. This marks the completion of a slot's worth of blocks.
 */
export class CheckpointProposal extends Gossipable {
  static override p2pTopic = TopicType.checkpoint_proposal;

  private sender: EthAddress | undefined;

  constructor(
    /** The aggregated checkpoint header for consensus */
    public readonly checkpointHeader: CheckpointHeader,

    /** Archive root after this checkpoint is applied */
    public readonly archive: Fr,

    /** The fee asset price modifier in basis points (from oracle) */
    public readonly feeAssetPriceModifier: bigint,

    /** The proposer's signature over the checkpoint payload (checkpointHeader + archive + feeAssetPriceModifier) */
    public readonly signature: Signature,

    /** Optional last block info, including its own signature for BlockProposal extraction */
    public readonly lastBlock?: CheckpointLastBlock,
  ) {
    super();
  }

  override generateP2PMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new CheckpointProposalHash(keccak256(this.signature.toBuffer())));
  }

  get slotNumber(): SlotNumber {
    return this.checkpointHeader.slotNumber;
  }

  get blockNumber(): BlockNumber {
    if (!this.lastBlock) {
      throw new Error('Cannot get blockNumber without lastBlock');
    }
    return this.lastBlock.blockHeader.getBlockNumber();
  }

  /** Convenience getter for txHashes from lastBlock */
  get txHashes(): TxHash[] {
    return this.lastBlock?.txHashes ?? [];
  }

  /** Convenience getter for txs from lastBlock */
  get txs(): Tx[] | undefined {
    return this.lastBlock?.signedTxs?.txs;
  }

  /**
   * Extract a BlockProposal from the last block info.
   * Uses inHash from checkpointHeader.contentCommitment.inHash
   */
  getBlockProposal(): BlockProposal | undefined {
    if (!this.lastBlock) {
      return undefined;
    }

    return new BlockProposal(
      this.lastBlock.blockHeader,
      this.lastBlock.indexWithinCheckpoint,
      this.checkpointHeader.inHash,
      this.archive,
      this.lastBlock.txHashes,
      this.lastBlock.signature,
      this.lastBlock.signedTxs,
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
  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    return serializeToBuffer([
      domainSeparator,
      this.checkpointHeader,
      this.archive,
      serializeSignedBigInt(this.feeAssetPriceModifier),
    ]);
  }

  static async createProposalFromSigner(
    checkpointHeader: CheckpointHeader,
    archiveRoot: Fr,
    feeAssetPriceModifier: bigint,
    lastBlockInfo: CheckpointLastBlockData | undefined,
    payloadSigner: (payload: Buffer32, context: SigningContext) => Promise<Signature>,
  ): Promise<CheckpointProposal> {
    // Sign the checkpoint payload with CHECKPOINT_PROPOSAL duty type
    const tempProposal = new CheckpointProposal(
      checkpointHeader,
      archiveRoot,
      feeAssetPriceModifier,
      Signature.empty(),
    );
    const checkpointHash = getHashedSignaturePayload(tempProposal, SignatureDomainSeparator.checkpointProposal);

    const checkpointContext: SigningContext = {
      slot: checkpointHeader.slotNumber,
      blockNumber: lastBlockInfo?.blockHeader?.globalVariables.blockNumber ?? BlockNumber(0),
      dutyType: DutyType.CHECKPOINT_PROPOSAL,
    };
    const checkpointSignature = await payloadSigner(checkpointHash, checkpointContext);

    if (!lastBlockInfo) {
      return new CheckpointProposal(checkpointHeader, archiveRoot, feeAssetPriceModifier, checkpointSignature);
    }

    const lastBlockProposal = await BlockProposal.createProposalFromSigner(
      lastBlockInfo.blockHeader,
      lastBlockInfo.indexWithinCheckpoint,
      checkpointHeader.inHash,
      archiveRoot,
      lastBlockInfo.txHashes,
      lastBlockInfo.txs,
      payloadSigner,
    );

    return new CheckpointProposal(checkpointHeader, archiveRoot, feeAssetPriceModifier, checkpointSignature, {
      blockHeader: lastBlockInfo.blockHeader,
      indexWithinCheckpoint: lastBlockInfo.indexWithinCheckpoint,
      txHashes: lastBlockInfo.txHashes,
      signature: lastBlockProposal.signature,
      signedTxs: lastBlockProposal.signedTxs,
    });
  }

  /**
   * Lazily evaluate the sender of the proposal; result is cached.
   * If there's a lastBlock, also verifies the block proposal sender matches the checkpoint sender.
   * @returns The sender address, or undefined if signature recovery fails or senders don't match
   */
  getSender(): EthAddress | undefined {
    if (!this.sender) {
      const hashed = getHashedSignaturePayloadEthSignedMessage(this, SignatureDomainSeparator.checkpointProposal);
      const checkpointSender = tryRecoverAddress(hashed, this.signature);

      // If there's a lastBlock, verify the block proposal sender matches
      if (checkpointSender && this.lastBlock) {
        const blockProposal = this.getBlockProposal();
        const blockSender = blockProposal?.getSender();
        if (!blockSender || !blockSender.equals(checkpointSender)) {
          return undefined; // Sender mismatch - fail
        }
      }

      // Cache the sender for later use
      this.sender = checkpointSender;
    }

    return this.sender;
  }

  getPayload() {
    return this.getPayloadToSign(SignatureDomainSeparator.checkpointProposal);
  }

  toBuffer(): Buffer {
    const buffer: any[] = [
      this.checkpointHeader,
      this.archive,
      serializeSignedBigInt(this.feeAssetPriceModifier),
      this.signature,
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

      return new CheckpointProposal(checkpointHeader, archive, feeAssetPriceModifier, signature, {
        blockHeader,
        indexWithinCheckpoint,
        txHashes,
        signature: blockSignature,
        signedTxs,
      });
    }

    return new CheckpointProposal(checkpointHeader, archive, feeAssetPriceModifier, signature);
  }

  getSize(): number {
    let size =
      this.checkpointHeader.toBuffer().length +
      this.archive.size +
      this.signature.getSize() +
      8 /* feeAssetPriceModifier */ +
      4; /* hasLastBlock flag */

    if (this.lastBlock) {
      size +=
        this.lastBlock.blockHeader.getSize() +
        4 /* indexWithinCheckpoint */ +
        this.lastBlock.signature.getSize() +
        4 /* txHashes.length */ +
        this.lastBlock.txHashes.length * TxHash.SIZE +
        4 /* hasSignedTxs flag */ +
        (this.lastBlock.signedTxs ? this.lastBlock.signedTxs.getSize() : 0);
    }

    return size;
  }

  static empty(): CheckpointProposal {
    return new CheckpointProposal(CheckpointHeader.empty(), Fr.ZERO, 0n, Signature.empty());
  }

  static random(): CheckpointProposal {
    return new CheckpointProposal(CheckpointHeader.random(), Fr.random(), 0n, Signature.random(), {
      blockHeader: BlockHeader.random(),
      indexWithinCheckpoint: IndexWithinCheckpoint(Math.floor(Math.random() * 5)),
      txHashes: [TxHash.random(), TxHash.random()],
      signature: Signature.random(),
    });
  }

  toInspect() {
    return {
      checkpointHeader: this.checkpointHeader.toInspect(),
      archive: this.archive.toString(),
      signature: this.signature.toString(),
      feeAssetPriceModifier: this.feeAssetPriceModifier.toString(),
      lastBlock: this.lastBlock
        ? {
            blockHeader: this.lastBlock.blockHeader.toInspect(),
            indexWithinCheckpoint: this.lastBlock.indexWithinCheckpoint,
            txHashes: this.lastBlock.txHashes.map(h => h.toString()),
            signature: this.lastBlock.signature.toString(),
          }
        : undefined,
    };
  }

  /**
   * Returns a copy of this proposal without lastBlock info, as a CheckpointProposalCore.
   * Used when the lastBlock has been extracted and stored separately.
   */
  toCore(): CheckpointProposalCore {
    return new CheckpointProposal(this.checkpointHeader, this.archive, this.feeAssetPriceModifier, this.signature);
  }
}

/**
 * A checkpoint proposal without the lastBlock info.
 * Used when the lastBlock has been extracted and handled separately as a BlockProposal.
 * This type makes it clear that lastBlock and getBlockProposal() are not available.
 */
export type CheckpointProposalCore = Omit<CheckpointProposal, 'lastBlock' | 'getBlockProposal' | 'toCore'>;
