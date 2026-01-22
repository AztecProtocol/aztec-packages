import { Buffer32 } from '@aztec/foundation/buffer';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { withoutHexPrefix } from '@aztec/foundation/string';

export type ViemZkPassportProofParams = {
  version: `0x${string}`;
  proofVerificationData: {
    vkeyHash: `0x${string}`;
    proof: `0x${string}`;
    publicInputs: `0x${string}`[];
  };
  committedInputs: `0x${string}`;
  serviceConfig: {
    validityPeriodInSeconds: bigint;
    domain: string;
    scope: string;
    devMode: boolean;
  };
};

// NOTE: Must match the ZkPassportProofParams struct in the zkpassport verifier contract
// find here: ROOT/l1-contracts/lib/circuits/src/solidity/src/ZKPassportVerifier.sol
export class ZkPassportProofParams {
  constructor(
    public devMode: boolean,
    public vkeyHash: Buffer32,
    public proof: Buffer,
    public publicInputs: Fr[],
    public committedInputs: Buffer,
    public validityPeriodInSeconds: bigint,
    public domain: string,
    public scope: string,
  ) {}

  toBuffer() {
    return serializeToBuffer([
      this.devMode,
      this.vkeyHash,
      this.proof.length,
      this.proof,
      this.publicInputs.length,
      this.publicInputs,
      this.committedInputs.length,
      this.committedInputs,
      this.validityPeriodInSeconds,
      this.domain,
      this.scope,
    ]);
  }

  static random() {
    const committedInputCounts = [BigInt(1), BigInt(2), BigInt(3), BigInt(4)];
    const numberOfCommittedInputs = committedInputCounts.reduce((acc, count) => acc + count, BigInt(0));
    const committedInputs = randomBytes(Number(numberOfCommittedInputs) * 32);

    const publicInputsCount = numberOfCommittedInputs + 16n;
    const publicInputs = Array.from({ length: Number(publicInputsCount) }, () => Fr.random());

    return new ZkPassportProofParams(
      false,
      Buffer32.random(),
      randomBytes(1024),
      publicInputs,
      committedInputs,
      BigInt(7 * 24 * 60 * 60), // 7 days
      'sequencer.alpha-testnet.aztec.network',
      'personhood',
    );
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    return new ZkPassportProofParams(
      reader.readBoolean(),
      reader.readObject(Buffer32),
      reader.readBuffer(),
      reader.readVector(Fr),
      reader.readBuffer(),
      reader.readUInt256(),
      reader.readString(),
      reader.readString(),
    );
  }

  static fromViem(params: ViemZkPassportProofParams) {
    return new ZkPassportProofParams(
      params.serviceConfig.devMode,
      Buffer32.fromString(params.proofVerificationData.vkeyHash),
      Buffer.from(withoutHexPrefix(params.proofVerificationData.proof), 'hex'),
      params.proofVerificationData.publicInputs.map(input => Fr.fromString(input)),
      Buffer.from(withoutHexPrefix(params.committedInputs), 'hex'),
      params.serviceConfig.validityPeriodInSeconds,
      params.serviceConfig.domain,
      params.serviceConfig.scope,
    );
  }

  toViem(): ViemZkPassportProofParams {
    // Version is set to bytes32(0) as per zkpassport library convention
    return {
      version: '0x0000000000000000000000000000000000000000000000000000000000000000',
      proofVerificationData: {
        vkeyHash: this.vkeyHash.toString(),
        proof: `0x${this.proof.toString('hex')}`,
        publicInputs: this.publicInputs.map(input => input.toString()),
      },
      committedInputs: `0x${this.committedInputs.toString('hex')}`,
      serviceConfig: {
        devMode: this.devMode,
        validityPeriodInSeconds: this.validityPeriodInSeconds,
        domain: this.domain,
        scope: this.scope,
      },
    };
  }
}
