import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, recoverAddress } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { BlockInfo } from '../block/l2_block.js';
import { TxHash } from '../tx/index.js';
import { Tx } from '../tx/tx.js';
import type { UInt32 } from '../types/index.js';
import { ConsensusPayload } from './consensus_payload.js';
import { Gossipable } from './gossipable.js';
import {
  SignatureDomainSeparator,
  getHashedSignaturePayload,
  getHashedSignaturePayloadEthSignedMessage,
} from './signature_utils.js';
import { TopicType } from './topic_type.js';

export class BlockProposalHash extends Buffer32 {
  constructor(hash: Buffer) {
    super(hash);
  }
}

export type BlockProposalOptions = {
  publishFullTxs: boolean;
};

/**
 * BlockProposal
 *
 * A block proposal is created by the leader of the chain proposing a sequence of transactions to
 * be included in the head of the chain
 */
export class BlockProposal extends Gossipable {
  static override p2pTopic = TopicType.block_proposal;

  private sender: EthAddress | undefined;

  constructor(
    /** The number of the block */
    public readonly blockNumber: UInt32,

    /** The payload of the message, and what the signature is over */
    public readonly payload: ConsensusPayload,

    /** The signer of the BlockProposal over the header of the new block*/
    public readonly signature: Signature,

    /** The sequence of transactions in the block */
    public readonly txHashes: TxHash[],

    // Note(md): this is placed after the txs payload in order to be backwards compatible with previous versions
    /** The transactions in the block */
    public readonly txs?: Tx[],

    /** Hash of the parent block header for p2p validation - not sent to L1 */
    public readonly parentHeaderHash?: Fr,
  ) {
    super();
  }

  override generateP2PMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new BlockProposalHash(keccak256(this.signature.toBuffer())));
  }

  get slotNumber(): Fr {
    return this.payload.header.slotNumber;
  }

  toBlockInfo(): BlockInfo {
    return {
      blockNumber: this.blockNumber,
      slotNumber: this.slotNumber.toNumber(),
      headerHash: this.payload.header.hash().toString(),
      txCount: this.txHashes.length,
    };
  }

  static async createProposalFromSigner(
    blockNumber: UInt32,
    payload: ConsensusPayload,
    txHashes: TxHash[],
    // Note(md): Provided separately to tx hashes such that this function can be optional
    txs: Tx[] | undefined,
    payloadSigner: (payload: Buffer32) => Promise<Signature>,
    parentHeaderHash?: Fr,
  ) {
    const hashed = getHashedSignaturePayload(payload, SignatureDomainSeparator.blockProposal);
    const sig = await payloadSigner(hashed);

    return new BlockProposal(blockNumber, payload, sig, txHashes, txs, parentHeaderHash);
  }

  /**Get Sender
   * Lazily evaluate the sender of the proposal; result is cached
   */
  getSender() {
    if (!this.sender) {
      const hashed = getHashedSignaturePayloadEthSignedMessage(this.payload, SignatureDomainSeparator.blockProposal);
      // Cache the sender for later use
      this.sender = recoverAddress(hashed, this.signature);
    }

    return this.sender;
  }

  getPayload() {
    return this.payload.getPayloadToSign(SignatureDomainSeparator.blockProposal);
  }

  toBuffer(): Buffer {
    const buffer: any[] = [this.blockNumber, this.payload, this.signature, this.txHashes.length, this.txHashes];

    // Always include a flag for parentHeaderHash presence and the value if present
    if (this.parentHeaderHash) {
      buffer.push(1); // flag: 1 if present, 0 if not
      buffer.push(this.parentHeaderHash);
    } else {
      buffer.push(0);
    }

    if (this.txs) {
      buffer.push(this.txs.length);
      buffer.push(this.txs);
    }
    return serializeToBuffer(buffer);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockProposal {
    const reader = BufferReader.asReader(buf);

    const blockNumber = reader.readNumber();
    const payload = reader.readObject(ConsensusPayload);
    const sig = reader.readObject(Signature);
    const txHashes = reader.readArray(reader.readNumber(), TxHash);

    // Always read parentHeaderHash flag since we always write it
    const hasParentHeaderHash = reader.readNumber(); // Read the flag
    let parentHeaderHash: Fr | undefined;
    if (hasParentHeaderHash === 1) {
      parentHeaderHash = reader.readObject(Fr);
    }

    let txs: Tx[] | undefined;
    if (!reader.isEmpty()) {
      txs = reader.readArray(reader.readNumber(), Tx);
    }

    return new BlockProposal(blockNumber, payload, sig, txHashes, txs, parentHeaderHash);
  }

  getSize(): number {
    return (
      4 /* blockNumber */ +
      this.payload.getSize() +
      this.signature.getSize() +
      4 /* txHashes.length */ +
      this.txHashes.length * TxHash.SIZE +
      (this.txs ? 4 /* txs.length */ + this.txs.reduce((acc, tx) => acc + tx.getSize(), 0) : 0) +
      4 /* parentHeaderHash flag */ +
      (this.parentHeaderHash ? Fr.SIZE_IN_BYTES : 0)
    );
  }
}
