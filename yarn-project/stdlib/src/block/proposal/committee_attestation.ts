import type { ViemCommitteeAttestation, ViemCommitteeAttestations } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export { EthAddress, Signature };

export class CommitteeAttestation {
  constructor(
    public readonly address: EthAddress,
    public readonly signature: Signature,
  ) {}

  static get schema() {
    return z
      .object({
        address: EthAddress.schema,
        signature: Signature.schema,
      })
      .transform(({ address, signature }) => new CommitteeAttestation(address, signature));
  }

  // Create an empty attestation for an address that has not signed
  static fromAddress(address: EthAddress): CommitteeAttestation {
    return new CommitteeAttestation(address, Signature.empty());
  }

  // Create an attestation from an address and a signature
  static fromAddressAndSignature(address: EthAddress, signature: Signature): CommitteeAttestation {
    return new CommitteeAttestation(address, signature);
  }

  static fromViem(viem: ViemCommitteeAttestation): CommitteeAttestation {
    return new CommitteeAttestation(EthAddress.fromString(viem.addr), Signature.fromViemSignature(viem.signature));
  }

  static fromBuffer(buffer: Buffer): CommitteeAttestation {
    const reader = BufferReader.asReader(buffer);
    const address = reader.readObject(EthAddress);
    const signature = reader.readObject(Signature);
    return new CommitteeAttestation(address, signature);
  }

  static random(): CommitteeAttestation {
    // note: will be invalid
    return new CommitteeAttestation(EthAddress.random(), Signature.random());
  }

  static empty(): CommitteeAttestation {
    return new CommitteeAttestation(EthAddress.ZERO, Signature.empty());
  }

  static fromPacked(packed: ViemCommitteeAttestations, committeeSize: number): CommitteeAttestation[] {
    const signatureIndicesBuffer = Buffer.from(packed.signatureIndices.slice(2), 'hex');
    const dataBuffer = Buffer.from(packed.signaturesOrAddresses.slice(2), 'hex');

    const attestations: CommitteeAttestation[] = [];
    let dataIndex = 0;

    for (let i = 0; i < committeeSize; i++) {
      // Check if this position has a signature
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      const hasSignature =
        byteIndex < signatureIndicesBuffer.length && (signatureIndicesBuffer[byteIndex] & (1 << bitIndex)) !== 0;

      if (hasSignature) {
        // Extract signature: v (1 byte) + r (32 bytes) + s (32 bytes)
        if (dataIndex + 65 > dataBuffer.length) {
          throw new Error(`Insufficient data for signature at position ${i}`);
        }

        const v = dataBuffer[dataIndex];
        const r = `0x${dataBuffer.subarray(dataIndex + 1, dataIndex + 33).toString('hex')}` as const;
        const s = `0x${dataBuffer.subarray(dataIndex + 33, dataIndex + 65).toString('hex')}` as const;

        const signature = Signature.fromViemSignature({ r, s, v });

        // For signed attestations, we use a zero address as the address is recovered from the signature
        attestations.push(new CommitteeAttestation(EthAddress.ZERO, signature));
        dataIndex += 65;
      } else {
        // Extract address (20 bytes)
        if (dataIndex + 20 > dataBuffer.length) {
          throw new Error(`Insufficient data for address at position ${i}`);
        }

        const addressBytes = dataBuffer.subarray(dataIndex, dataIndex + 20);
        const address = EthAddress.fromString(`0x${addressBytes.toString('hex')}`);

        // For address-only attestations, use empty signature
        attestations.push(new CommitteeAttestation(address, Signature.empty()));
        dataIndex += 20;
      }
    }

    return attestations;
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.address, this.signature]);
  }

  equals(other: CommitteeAttestation): boolean {
    return this.address.equals(other.address) && this.signature.equals(other.signature);
  }

  toViem(): ViemCommitteeAttestation {
    return {
      addr: this.address.toString(),
      signature: this.signature.toViemSignature(),
    };
  }
}
