import { EthAddress, Header } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { keccak256, recoverMessageAddress } from 'viem';

import { Gossipable } from './gossipable.js';
import { Signature } from './signature.js';
import { TopicType, createTopicString } from './topic_type.js';
import { TxHash } from '../tx/tx_hash.js';

export class BlockAttestationHash extends Buffer32 {
  constructor(hash: Buffer) {
    super(hash);
  }
}

/**
 * BlockAttestation
 *
 * A validator that has attested to seeing the contents of a block
 * will produce a block attestation over the header of the block
 */
export class BlockAttestation extends Gossipable {
  static override p2pTopic: string;

  private sender: EthAddress | undefined;

  constructor(
    /** The block header the attestation is made over */
    public readonly header: Header,
    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    public readonly txHashes: TxHash[],
    /** The signature of the block attester */
    public readonly signature: Signature,
  ) {
    super();
  }

  static {
    this.p2pTopic = createTopicString(TopicType.block_attestation);
  }

  override p2pMessageIdentifier(): Buffer32 {
    return BlockAttestationHash.fromField(this.archive);
  }

  /**Get sender
   *
   * Lazily evaluate and cache the sender of the attestation
   * @returns The sender of the attestation
   */
  async getSender() {
    if (!this.sender) {
      // Recover the sender from the attestation
      const payload = serializeToBuffer([this.archive, this.txHashes]);
      console.log("ATTESTATION PAYLOAD", payload);
      // TODO(md) - temporarily hashing again to hav eless changes in the rollup
      const hashed = keccak256(payload);
      // const payload0x: `0x${string}` = `0x${payload.toString('hex')}`;
      const address = await recoverMessageAddress({
        message: { raw: hashed },
        signature: this.signature.to0xString(),
      });
      // Cache the sender for later use
      this.sender = EthAddress.fromString(address);
    }

    return this.sender;
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.header, this.archive, this.txHashes.length, this.txHashes,   this.signature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockAttestation {
    const reader = BufferReader.asReader(buf);
    return new BlockAttestation(reader.readObject(Header), reader.readObject(Fr), reader.readArray(reader.readNumber(), TxHash), reader.readObject(Signature));
  }

  static empty(): BlockAttestation {
    return new BlockAttestation(Header.empty(), Fr.ZERO, [], Signature.empty());
  }
}
