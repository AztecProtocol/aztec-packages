import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, tryRecoverAddress } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';
import { ConsensusPayload } from './consensus_payload.js';
import { Gossipable } from './gossipable.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from './signature_utils.js';
import { TopicType } from './topic_type.js';

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
  static override p2pTopic = TopicType.block_attestation;

  private sender: EthAddress | undefined;
  private proposer: EthAddress | undefined;

  constructor(
    /** The payload of the message, and what the signature is over */
    public readonly payload: ConsensusPayload,

    /** The signature of the block attester */
    public readonly signature: Signature,

    /** The signature from the block proposer */
    public readonly proposerSignature: Signature,
  ) {
    super();
  }

  static get schema(): ZodFor<BlockAttestation> {
    return z
      .object({
        payload: ConsensusPayload.schema,
        signature: Signature.schema,
        proposerSignature: Signature.schema,
      })
      .transform(obj => new BlockAttestation(obj.payload, obj.signature, obj.proposerSignature));
  }

  override generateP2PMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new BlockAttestationHash(keccak256(this.signature.toBuffer())));
  }

  get archive(): Fr {
    return this.payload.archive;
  }

  get slotNumber(): Fr {
    return this.payload.header.slotNumber;
  }

  /**
   * Lazily evaluate and cache the signer of the attestation
   * @returns The signer of the attestation, or undefined if signature recovery fails
   */
  getSender(): EthAddress | undefined {
    if (!this.sender) {
      // Recover the sender from the attestation
      const hashed = getHashedSignaturePayloadEthSignedMessage(this.payload, SignatureDomainSeparator.blockAttestation);
      // Cache the sender for later use
      this.sender = tryRecoverAddress(hashed, this.signature);
    }

    return this.sender;
  }

  /**
   * Lazily evaluate and cache the proposer of the block
   * @returns The proposer of the block
   */
  getProposer(): EthAddress | undefined {
    if (!this.proposer) {
      // Recover the proposer from the proposal signature
      const hashed = getHashedSignaturePayloadEthSignedMessage(this.payload, SignatureDomainSeparator.blockProposal);
      // Cache the proposer for later use
      this.proposer = tryRecoverAddress(hashed, this.proposerSignature);
    }

    return this.proposer;
  }

  getPayload(): Buffer {
    return this.payload.getPayloadToSign(SignatureDomainSeparator.blockAttestation);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.payload, this.signature, this.proposerSignature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockAttestation {
    const reader = BufferReader.asReader(buf);
    return new BlockAttestation(
      reader.readObject(ConsensusPayload),
      reader.readObject(Signature),
      reader.readObject(Signature),
    );
  }

  static empty(): BlockAttestation {
    return new BlockAttestation(ConsensusPayload.empty(), Signature.empty(), Signature.empty());
  }

  static random(): BlockAttestation {
    return new BlockAttestation(ConsensusPayload.random(), Signature.random(), Signature.random());
  }

  getSize(): number {
    return this.payload.getSize() + this.signature.getSize() + this.proposerSignature.getSize();
  }

  toInspect() {
    return {
      payload: this.payload.toInspect(),
      signature: this.signature.toString(),
      proposerSignature: this.proposerSignature.toString(),
    };
  }
}
