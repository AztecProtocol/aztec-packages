import { BlockNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { DutyType, type SigningContext } from '@aztec/validator-ha-signer/types';

import type { L2Block } from '../block/l2_block.js';
import type { L2BlockInfo } from '../block/l2_block_info.js';
import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/index.js';
import type { Tx } from '../tx/tx.js';
import { Gossipable } from './gossipable.js';
import {
  SignatureDomainSeparator,
  getHashedSignaturePayload,
  getHashedSignaturePayloadEthSignedMessage,
} from './signature_utils.js';
import { SignedTxs } from './signed_txs.js';
import { TopicType } from './topic_type.js';

export class BlockProposalHash extends Buffer32 {
  constructor(hash: Buffer) {
    super(hash);
  }
}

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
export class BlockProposal extends Gossipable {
  static override p2pTopic = TopicType.block_proposal;

  private sender: EthAddress | undefined;

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

    /** The signed transactions in the block (optional, for DA guarantees) */
    public readonly signedTxs?: SignedTxs,
  ) {
    super();
  }

  override generateP2PMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new BlockProposalHash(keccak256(this.signature.toBuffer())));
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
   * The signature is over: blockHeader + indexWithinCheckpoint + inHash + archiveRoot + txHashes
   */
  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    return serializeToBuffer([
      domainSeparator,
      this.blockHeader,
      this.indexWithinCheckpoint,
      this.inHash,
      this.archiveRoot,
      this.txHashes.length,
      this.txHashes,
    ]);
  }

  static async createProposalFromSigner(
    blockHeader: BlockHeader,
    indexWithinCheckpoint: IndexWithinCheckpoint,
    inHash: Fr,
    archiveRoot: Fr,
    txHashes: TxHash[],
    txs: Tx[] | undefined,
    payloadSigner: (payload: Buffer32, context: SigningContext) => Promise<Signature>,
  ): Promise<BlockProposal> {
    // Create a temporary proposal to get the payload to sign
    const tempProposal = new BlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archiveRoot,
      txHashes,
      Signature.empty(),
    );

    // Create the block signing context
    const blockContext: SigningContext = {
      slot: blockHeader.globalVariables.slotNumber,
      blockNumber: blockHeader.globalVariables.blockNumber,
      blockIndexWithinCheckpoint: indexWithinCheckpoint,
      dutyType: DutyType.BLOCK_PROPOSAL,
    };

    const hashed = getHashedSignaturePayload(tempProposal, SignatureDomainSeparator.blockProposal);
    const sig = await payloadSigner(hashed, blockContext);

    // If txs are provided, sign them as well
    let signedTxs: SignedTxs | undefined;
    if (txs) {
      const txsSigningContext: SigningContext = { dutyType: DutyType.TXS };
      const txsSigner = (payload: Buffer32) => payloadSigner(payload, txsSigningContext);
      signedTxs = await SignedTxs.createFromSigner(txs, txsSigner);
    }

    return new BlockProposal(blockHeader, indexWithinCheckpoint, inHash, archiveRoot, txHashes, sig, signedTxs);
  }

  /**
   * Lazily evaluate the sender of the proposal; result is cached.
   * If there's signedTxs, also verifies the signedTxs sender matches the block proposal sender.
   * @returns The sender address, or undefined if signature recovery fails or senders don't match
   */
  getSender(): EthAddress | undefined {
    if (!this.sender) {
      const hashed = getHashedSignaturePayloadEthSignedMessage(this, SignatureDomainSeparator.blockProposal);
      const blockSender = tryRecoverAddress(hashed, this.signature);

      // If there's signedTxs, verify the sender matches
      if (blockSender && this.signedTxs) {
        const txsSender = this.signedTxs.getSender();
        if (!txsSender || !txsSender.equals(blockSender)) {
          return undefined; // Sender mismatch - fail
        }
      }

      // Cache the sender for later use
      this.sender = blockSender;
    }

    return this.sender;
  }

  getPayload() {
    return this.getPayloadToSign(SignatureDomainSeparator.blockProposal);
  }

  toBuffer(): Buffer {
    const buffer: any[] = [
      this.blockHeader,
      this.indexWithinCheckpoint,
      this.inHash,
      this.archiveRoot,
      this.signature,
      this.txHashes.length,
      this.txHashes,
    ];
    if (this.signedTxs) {
      buffer.push(1); // hasSignedTxs = true
      buffer.push(this.signedTxs.toBuffer());
    } else {
      buffer.push(0); // hasSignedTxs = false
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
    const txHashCount = reader.readNumber();
    if (txHashCount > MAX_TXS_PER_BLOCK) {
      throw new Error(`txHashes count ${txHashCount} exceeds maximum ${MAX_TXS_PER_BLOCK}`);
    }
    const txHashes = reader.readArray(txHashCount, TxHash);

    if (!reader.isEmpty()) {
      const hasSignedTxs = reader.readNumber();
      if (hasSignedTxs) {
        const signedTxs = SignedTxs.fromBuffer(reader);
        return new BlockProposal(
          blockHeader,
          indexWithinCheckpoint,
          inHash,
          archiveRoot,
          txHashes,
          signature,
          signedTxs,
        );
      }
    }

    return new BlockProposal(blockHeader, indexWithinCheckpoint, inHash, archiveRoot, txHashes, signature);
  }

  getSize(): number {
    return (
      this.blockHeader.getSize() +
      4 /* indexWithinCheckpoint */ +
      this.inHash.size +
      this.archiveRoot.size +
      this.signature.getSize() +
      4 /* txHashes.length */ +
      this.txHashes.length * TxHash.SIZE +
      4 /* hasSignedTxs flag */ +
      (this.signedTxs ? this.signedTxs.getSize() : 0)
    );
  }

  static empty(): BlockProposal {
    return new BlockProposal(BlockHeader.empty(), IndexWithinCheckpoint(0), Fr.ZERO, Fr.ZERO, [], Signature.empty());
  }

  static random(): BlockProposal {
    return new BlockProposal(
      BlockHeader.random(),
      IndexWithinCheckpoint(Math.floor(Math.random() * 5)),
      Fr.random(),
      Fr.random(),
      [TxHash.random(), TxHash.random()],
      Signature.random(),
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
    );
  }
}
