import { Buffer32 } from '@aztec/foundation/buffer';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { withoutHexPrefix } from '@aztec/foundation/string';

export type ViemZkPassportProofParams = {
  vkeyHash: `0x${string}`;
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
  committedInputs: `0x${string}`;
  committedInputCounts: bigint[];
  validityPeriodInDays: bigint;
  scope: string;
  subscope: string;
  devMode: boolean;
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
    public committedInputCounts: bigint[],
    public validityPeriodInDays: bigint,
    public scope: string,
    public subscope: string,
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
      this.committedInputCounts.length,
      this.committedInputCounts,
      this.validityPeriodInDays,
      this.scope,
      this.subscope,
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
      committedInputCounts,
      BigInt(100),
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
      reader.readUint256Vector(),
      reader.readUInt256(),
      reader.readString(),
      reader.readString(),
    );
  }

  static fromViem(params: ViemZkPassportProofParams) {
    return new ZkPassportProofParams(
      params.devMode,
      Buffer32.fromString(params.vkeyHash),
      Buffer.from(withoutHexPrefix(params.proof), 'hex'),
      params.publicInputs.map(input => Fr.fromString(input)),
      Buffer.from(withoutHexPrefix(params.committedInputs), 'hex'),
      params.committedInputCounts,
      params.validityPeriodInDays,
      params.scope,
      params.subscope,
    );
  }

  toViem(): ViemZkPassportProofParams {
    return {
      devMode: this.devMode,
      vkeyHash: this.vkeyHash.toString(),
      proof: `0x${this.proof.toString('hex')}`,
      publicInputs: this.publicInputs.map(input => input.toString()),
      committedInputs: `0x${this.committedInputs.toString('hex')}`,
      committedInputCounts: this.committedInputCounts,
      validityPeriodInDays: this.validityPeriodInDays,
      scope: this.scope,
      subscope: this.subscope,
    };
  }
}
