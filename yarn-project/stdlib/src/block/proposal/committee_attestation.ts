import type { ViemCommitteeAttestation } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export { Signature };
export { EthAddress };

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
