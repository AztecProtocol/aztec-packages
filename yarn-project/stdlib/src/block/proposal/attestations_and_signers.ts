import type { ViemCommitteeAttestations } from '@aztec/ethereum';
import { hexToBuffer } from '@aztec/foundation/string';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import type { Signable, SignatureDomainSeparator } from '../../p2p/signature_utils.js';
import { CommitteeAttestation } from './committee_attestation.js';

export class CommitteeAttestationsAndSigners implements Signable {
  constructor(public attestations: CommitteeAttestation[]) {}

  static get schema() {
    return z
      .object({
        attestations: CommitteeAttestation.schema.array(),
      })
      .transform(obj => new CommitteeAttestationsAndSigners(obj.attestations));
  }

  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    const abi = parseAbiParameters('uint8,(bytes,bytes),address[]');
    const packed = this.getPackedAttestations();

    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [packed.signatureIndices, packed.signaturesOrAddresses],
      this.getSigners().map(s => s.toString()),
    ]);

    return hexToBuffer(encodedData);
  }

  static empty(): CommitteeAttestationsAndSigners {
    return new CommitteeAttestationsAndSigners([]);
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
  getPackedAttestations(): ViemCommitteeAttestations {
    const length = this.attestations.length;
    const attestations = this.attestations.map(a => a.toViem());

    // Calculate bitmap size (1 bit per attestation, rounded up to nearest byte)
    const bitmapSize = Math.ceil(length / 8);
    const signatureIndices = new Uint8Array(bitmapSize);

    // Calculate total data size needed
    let totalDataSize = 0;
    for (let i = 0; i < length; i++) {
      const signature = attestations[i].signature;
      // Check if signature is empty (v = 0)
      const isEmpty = signature.v === 0;

      if (!isEmpty) {
        totalDataSize += 65; // v (1) + r (32) + s (32)
      } else {
        totalDataSize += 20; // address only
      }
    }

    const signaturesOrAddresses = new Uint8Array(totalDataSize);
    let dataIndex = 0;

    // Pack the data
    for (let i = 0; i < length; i++) {
      const attestation = attestations[i];
      const signature = attestation.signature;

      // Check if signature is empty
      const isEmpty = signature.v === 0;

      if (!isEmpty) {
        // Set bit in bitmap (bit 7-0 in each byte, left to right)
        const byteIndex = Math.floor(i / 8);
        const bitIndex = 7 - (i % 8);
        signatureIndices[byteIndex] |= 1 << bitIndex;

        // Pack signature: v + r + s
        signaturesOrAddresses[dataIndex] = signature.v;
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
}
