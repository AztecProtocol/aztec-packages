import { CheckpointAttestationHash, SlotNumber } from '@aztec/foundation/branded-types';
import type { BaseBuffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';
import { CheckpointProposal } from './checkpoint_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
import { Gossipable } from './gossipable.js';
import {
  type CoordinationSignatureContext,
  SignatureDomainSeparator,
  getCoordinationSignatureContextKey,
  recoverCoordinationSigner,
} from './signature_utils.js';
import { TopicType } from './topic_type.js';

export type { CheckpointAttestationHash } from '@aztec/foundation/branded-types';

/**
 * CheckpointAttestation
 *
 * A validator that has attested to seeing all blocks in a checkpoint
 * will produce a checkpoint attestation over the checkpoint header.
 */
export class CheckpointAttestation extends Gossipable {
  static override p2pTopic = TopicType.checkpoint_attestation;

  private senderCache:
    | {
        key: string;
        sender: EthAddress | undefined;
      }
    | undefined;
  private proposerCache:
    | {
        key: string;
        proposer: EthAddress | undefined;
      }
    | undefined;

  constructor(
    /** The payload of the message, and what the signature is over */
    public readonly payload: ConsensusPayload,

    /** The signature of the checkpoint attester */
    public readonly signature: Signature,

    /** The signature from the checkpoint proposer */
    public readonly proposerSignature: Signature,
  ) {
    super();
  }

  static get schema(): ZodFor<CheckpointAttestation> {
    return z
      .object({
        payload: ConsensusPayload.schema,
        signature: Signature.schema,
        proposerSignature: Signature.schema,
      })
      .transform(obj => new CheckpointAttestation(obj.payload, obj.signature, obj.proposerSignature));
  }

  override generateP2PMessageIdentifier(): Promise<BaseBuffer32> {
    return Promise.resolve(CheckpointAttestationHash.fromBuffer(keccak256(this.signature.toBuffer())));
  }

  get archive(): Fr {
    return this.payload.archive;
  }

  get slotNumber(): SlotNumber {
    return this.payload.header.slotNumber;
  }

  /**
   * Lazily evaluate and cache the signer of the attestation
   * @returns The signer of the attestation, or undefined if signature recovery fails
   */
  getSender(signatureContext: CoordinationSignatureContext): EthAddress | undefined {
    const cacheKey = getCoordinationSignatureContextKey(signatureContext);
    if (!this.senderCache || this.senderCache.key !== cacheKey) {
      const sender = recoverCoordinationSigner(
        this.payload,
        SignatureDomainSeparator.checkpointAttestation,
        this.signature,
        signatureContext,
      );
      this.senderCache = { key: cacheKey, sender };
    }

    return this.senderCache.sender;
  }

  /**
   * Lazily evaluate and cache the proposer of the checkpoint
   * @returns The proposer of the checkpoint
   */
  getProposer(signatureContext: CoordinationSignatureContext): EthAddress | undefined {
    const cacheKey = getCoordinationSignatureContextKey(signatureContext);
    if (!this.proposerCache || this.proposerCache.key !== cacheKey) {
      // Create a temporary CheckpointProposal to recover the proposer address.
      // We need to use CheckpointProposal because it has a different getPayloadToSign()
      // implementation than ConsensusPayload (uses serializeToBuffer vs ABI encoding).
      const proposal = new CheckpointProposal(
        this.payload.header,
        this.payload.archive,
        this.payload.feeAssetPriceModifier,
        this.proposerSignature,
      );
      const proposer = proposal.getSender(signatureContext);
      this.proposerCache = { key: cacheKey, proposer };
    }

    return this.proposerCache.proposer;
  }

  getPayload(): Buffer {
    return this.payload.getPayloadToSign(SignatureDomainSeparator.checkpointAttestation);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.payload, this.signature, this.proposerSignature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): CheckpointAttestation {
    const reader = BufferReader.asReader(buf);
    return new CheckpointAttestation(
      reader.readObject(ConsensusPayload),
      reader.readObject(Signature),
      reader.readObject(Signature),
    );
  }

  static empty(): CheckpointAttestation {
    return new CheckpointAttestation(ConsensusPayload.empty(), Signature.empty(), Signature.empty());
  }

  static random(): CheckpointAttestation {
    return new CheckpointAttestation(ConsensusPayload.random(), Signature.random(), Signature.random());
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
