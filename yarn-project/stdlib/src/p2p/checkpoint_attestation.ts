import { CheckpointProposalHash, type SlotNumber } from '@aztec/foundation/branded-types';
import { type BaseBuffer32, Buffer32 } from '@aztec/foundation/buffer';
import { normalizeSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';
import { CheckpointProposal } from './checkpoint_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
import { Gossipable } from './gossipable.js';
import { type CoordinationSignatureContext, recoverCoordinationSigner } from './signature_utils.js';
import { TopicType } from './topic_type.js';

/**
 * CheckpointAttestation
 *
 * A validator that has attested to seeing all blocks in a checkpoint
 * will produce a checkpoint attestation over the checkpoint header.
 */
export class CheckpointAttestation extends Gossipable {
  static override p2pTopic = TopicType.checkpoint_attestation;

  private cachedSender: EthAddress | undefined | null = undefined;
  private cachedProposer: EthAddress | undefined | null = undefined;

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
    return Promise.resolve(new Buffer32(this.payload.getPayloadHash()));
  }

  get archive(): Fr {
    return this.payload.archive;
  }

  get slotNumber(): SlotNumber {
    return this.payload.header.slotNumber;
  }

  get signatureContext(): CoordinationSignatureContext {
    return this.payload.signatureContext;
  }

  /**
   * Lazily evaluate and cache the signer of the attestation
   * @returns The signer of the attestation, or undefined if signature recovery fails
   */
  getSender(): EthAddress | undefined {
    if (this.cachedSender === undefined) {
      this.cachedSender = recoverCoordinationSigner(this.payload, this.signature) ?? null;
    }
    return this.cachedSender ?? undefined;
  }

  /**
   * Lazily evaluate and cache the proposer of the checkpoint
   * @returns The proposer of the checkpoint
   */
  getProposer(): EthAddress | undefined {
    if (this.cachedProposer === undefined) {
      // Create a temporary CheckpointProposal to recover the proposer address.
      // We need to use CheckpointProposal because it has a different getPayloadToSign()
      // implementation than ConsensusPayload (uses serializeToBuffer vs ABI encoding).
      const proposal = new CheckpointProposal(
        this.payload.header,
        this.payload.archive,
        this.payload.feeAssetPriceModifier,
        this.proposerSignature,
        this.payload.signatureContext,
      );
      this.cachedProposer = proposal.getSender() ?? null;
    }
    return this.cachedProposer ?? undefined;
  }

  /**
   * Returns a copy with the attester signature canonicalized to v ∈ {27, 28}. Callers store attestations
   * received from gossip verbatim; normalizing on ingress keeps a signature emitted in yParity form
   * (v = 0/1) — whether by a malicious committee member or a peer mutating the byte in flight — from
   * reaching the L1 bundle in a non-canonical form. Must only be called once the signature has recovered
   * a sender (so it is non-empty and low-s); `normalizeSignature` throws on an all-zero signature.
   */
  withNormalizedSignature(): CheckpointAttestation {
    return new CheckpointAttestation(this.payload, normalizeSignature(this.signature), this.proposerSignature);
  }

  getPayload(): Buffer {
    return this.payload.getPayloadToSign();
  }

  /**
   * Returns a keccak256 hash of the signed consensus payload.
   * Used to dedup distinct signed payloads. Returns same hash than the corresponding proposal.
   */
  getPayloadHash(): CheckpointProposalHash {
    return CheckpointProposalHash.fromBuffer(this.payload.getPayloadHash());
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
