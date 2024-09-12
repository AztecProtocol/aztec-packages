import { type EthAddress, Header } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { TxHash } from '../tx/tx_hash.js';
import { get0xStringHashedSignaturePayload, getHashedSignaturePayload, getSignaturePayload } from './block_utils.js';
import { Gossipable } from './gossipable.js';
import { TopicType, createTopicString } from './topic_type.js';
import { recoverAddress } from '@aztec/foundation/crypto';

export class BlockProposalHash extends Buffer32 {
  constructor(hash: Buffer) {
    super(hash);
  }
}

/**
 * BlockProposal
 *
 * A block proposal is created by the leader of the chain proposing a sequence of transactions to
 * be included in the head of the chain
 */
export class BlockProposal extends Gossipable {
  static override p2pTopic: string;

  private sender: EthAddress | undefined;

  constructor(
    /** The block header, after execution of the below sequence of transactions */
    public readonly header: Header,

    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    /** The sequence of transactions in the block */
    public readonly txs: TxHash[],
    /** The signer of the BlockProposal over the header of the new block*/
    public readonly signature: Signature,
  ) {
    super();
  }

  static {
    this.p2pTopic = createTopicString(TopicType.block_proposal);
  }

  override p2pMessageIdentifier(): Buffer32 {
    return BlockProposalHash.fromField(this.archive);
  }

  static async createProposalFromSigner(
    header: Header,
    archive: Fr,
    txs: TxHash[],
    payloadSigner: (payload: Buffer32) => Promise<Signature>,
  ) {
    const hashed = getHashedSignaturePayload(archive, txs);
    const sig = await payloadSigner(hashed);

    return new BlockProposal(header, archive, txs, sig);
  }

  /**Get Sender
   * Lazily evaluate the sender of the proposal; result is cached
   */
  getSender() {
    if (!this.sender) {
      const hashed = getHashedSignaturePayload(this.archive, this.txs);
      // Cache the sender for later use
      this.sender = recoverAddress(hashed, this.signature);
    }

    return this.sender;
  }

  getPayload() {
    return getSignaturePayload(this.archive, this.txs);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.header, this.archive, this.txs.length, this.txs, this.signature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockProposal {
    const reader = BufferReader.asReader(buf);
    return new BlockProposal(
      reader.readObject(Header),
      reader.readObject(Fr),
      reader.readArray(reader.readNumber(), TxHash),
      reader.readObject(Signature),
    );
  }
}
