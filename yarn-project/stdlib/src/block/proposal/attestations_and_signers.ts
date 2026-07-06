import type { ViemCommitteeAttestations } from '@aztec/ethereum/contracts';
import { hexToBuffer } from '@aztec/foundation/string';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import {
  type CoordinationSignatureContext,
  type CoordinationSignatureType,
  type Signable,
  coordinationSignatureContextSchema,
} from '../../p2p/signature_utils.js';
import { CommitteeAttestation, EthAddress } from './committee_attestation.js';

export class CommitteeAttestationsAndSigners implements Signable {
  readonly primaryType: CoordinationSignatureType = 'AttestationsAndSigners';

  constructor(
    public attestations: CommitteeAttestation[],
    public readonly signatureContext: CoordinationSignatureContext,
  ) {}

  static get schema() {
    return z
      .object({
        attestations: CommitteeAttestation.schema.array(),
        signatureContext: coordinationSignatureContextSchema,
      })
      .transform(obj => new CommitteeAttestationsAndSigners(obj.attestations, obj.signatureContext));
  }

  getPayloadToSign(): Buffer {
    // Matches the L1 abi.encode(attestations, signers) in AttestationLib.sol#getAttestationsAndSignersDigest.
    const abi = parseAbiParameters('(bytes,bytes),address[]');
    const packed = this.getPackedAttestations();

    const encodedData = encodeAbiParameters(abi, [
      [packed.signatureIndices, packed.signaturesOrAddresses],
      this.getSigners().map(s => s.toString()),
    ]);

    return hexToBuffer(encodedData);
  }

  static empty(signatureContext: CoordinationSignatureContext): CommitteeAttestationsAndSigners {
    return new CommitteeAttestationsAndSigners([], signatureContext);
  }

  toString() {
    throw new Error('Not implemented');
  }

  getSigners() {
    return this.attestations.filter(a => !a.signature.isEmpty()).map(a => a.address);
  }

  getSignedAttestations() {
    return this.attestations.filter(a => !a.signature.isEmpty());
  }

  /**
   * Packs an array of committee attestations into the format expected by the Solidity contract
   *
   * @param attestations - Array of committee attestations with addresses and signatures
   * @returns Packed attestations with bitmap and tightly packed signature/address data
   */
  static packAttestations(attestations: CommitteeAttestation[]): ViemCommitteeAttestations {
    const length = attestations.length;
    const viemAttestations = attestations.map(a => a.toViem());

    // Calculate bitmap size (1 bit per attestation, rounded up to nearest byte)
    const bitmapSize = Math.ceil(length / 8);
    const signatureIndices = new Uint8Array(bitmapSize);

    // Calculate total data size needed
    let totalDataSize = 0;
    for (const attestation of viemAttestations) {
      const signature = attestation.signature;
      // A slot is empty (a non-signing member, packed as its address) only when r, s and v are all zero
      // — matching Signature.isEmpty() and getSigners(), so the bitmap popcount and the signers list can
      // never disagree (which would revert propose() with SignersSizeMismatch).
      const isEmpty = signature.v === 0 && BigInt(signature.r) === 0n && BigInt(signature.s) === 0n;

      if (!isEmpty) {
        totalDataSize += 65; // v (1) + r (32) + s (32)
      } else {
        totalDataSize += 20; // address only
      }
    }

    const signaturesOrAddresses = new Uint8Array(totalDataSize);
    let dataIndex = 0;

    // Pack the data
    for (const [i, attestation] of viemAttestations.entries()) {
      const signature = attestation.signature;

      // Empty iff r, s and v are all zero (see the size-tally loop above).
      const isEmpty = signature.v === 0 && BigInt(signature.r) === 0n && BigInt(signature.s) === 0n;

      if (!isEmpty) {
        // Set bit in bitmap (bit 7-0 in each byte, left to right)
        const byteIndex = Math.floor(i / 8);
        const bitIndex = 7 - (i % 8);
        signatureIndices[byteIndex] = (signatureIndices[byteIndex] ?? 0) | (1 << bitIndex);

        // Pack signature: v + r + s. Canonicalize a yParity recovery byte (v = 0/1) to 27/28 — it
        // recovers to the same signer, but L1 ECDSA.recover only accepts 27/28. Any other value is left
        // as-is so a genuinely malformed signature still fails on L1 rather than being silently rewritten.
        signaturesOrAddresses[dataIndex] = signature.v === 0 || signature.v === 1 ? signature.v + 27 : signature.v;
        dataIndex++;

        // Pack r (32 bytes)
        const rBytes = Buffer.from(signature.r.slice(2), 'hex');
        signaturesOrAddresses.set(rBytes, dataIndex);
        dataIndex += 32;

        // Pack s (32 bytes)
        const sBytes = Buffer.from(signature.s.slice(2), 'hex');
        signaturesOrAddresses.set(sBytes, dataIndex);
        dataIndex += 32;
      } else {
        // Pack address only (20 bytes)
        const addrBytes = Buffer.from(attestation.addr.slice(2), 'hex');
        signaturesOrAddresses.set(addrBytes, dataIndex);
        dataIndex += 20;
      }
    }

    return {
      signatureIndices: `0x${Buffer.from(signatureIndices).toString('hex')}`,
      signaturesOrAddresses: `0x${Buffer.from(signaturesOrAddresses).toString('hex')}`,
    };
  }

  getPackedAttestations(): ViemCommitteeAttestations {
    return CommitteeAttestationsAndSigners.packAttestations(this.attestations);
  }
}

/**
 * Malicious extension of CommitteeAttestationsAndSigners that keeps separate attestations and
 * signers. Used for tricking the L1 contract into accepting attestations by reconstructing
 * the correct committee commitment (which relies on the signers, ignoring the signatures)
 * with an invalid set of attestation signatures.
 */
export class MaliciousCommitteeAttestationsAndSigners extends CommitteeAttestationsAndSigners {
  constructor(
    attestations: CommitteeAttestation[],
    private signers: EthAddress[],
    signatureContext: CoordinationSignatureContext,
  ) {
    super(attestations, signatureContext);
  }

  override getSigners(): EthAddress[] {
    return this.signers;
  }
}
