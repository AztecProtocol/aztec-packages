import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, recoverAddress } from '@aztec/foundation/crypto';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Fr } from '@aztec/foundation/fields';
import { type ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { ConsensusPayload } from './consensus_payload.js';
import { Gossipable } from './gossipable.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from './signature_utils.js';
import { TopicType, createTopicString } from './topic_type.js';

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
  static override p2pTopic = createTopicString(TopicType.block_attestation);

  private sender: EthAddress | undefined;

  constructor(
    /** The payload of the message, and what the signature is over */
    public readonly payload: ConsensusPayload,

    /** The signature of the block attester */
    public readonly signature: Signature,
  ) {
    super();
  }

  static get schema(): ZodFor<BlockAttestation> {
    return z
      .object({
        payload: ConsensusPayload.schema,
        signature: Signature.schema,
      })
      .transform(obj => new BlockAttestation(obj.payload, obj.signature));
  }

  override p2pMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new BlockAttestationHash(keccak256(this.signature.toBuffer())));
  }

  get archive(): Fr {
    return this.payload.archive;
  }

  get slotNumber(): Fr {
    return this.payload.header.globalVariables.slotNumber;
  }

  get blockNumber(): Fr {
    return this.payload.header.globalVariables.blockNumber;
  }

  /**Get sender
   *
   * Lazily evaluate and cache the sender of the attestation
   * @returns The sender of the attestation
   */
  async getSender(): Promise<EthAddress> {
    if (!this.sender) {
      // Recover the sender from the attestation
      const hashed = await getHashedSignaturePayloadEthSignedMessage(
        this.payload,
        SignatureDomainSeparator.blockAttestation,
      );
      // Cache the sender for later use
      this.sender = recoverAddress(hashed, this.signature);
    }

    return this.sender;
  }

  getPayload(): Promise<Buffer> {
    return this.payload.getPayloadToSign(SignatureDomainSeparator.blockAttestation);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.payload, this.signature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockAttestation {
    const reader = BufferReader.asReader(buf);
    return new BlockAttestation(reader.readObject(ConsensusPayload), reader.readObject(Signature));
  }

  static empty(): BlockAttestation {
    return new BlockAttestation(ConsensusPayload.empty(), Signature.empty());
  }

  getSize(): number {
    return this.payload.getSize() + this.signature.getSize();
  }
}
