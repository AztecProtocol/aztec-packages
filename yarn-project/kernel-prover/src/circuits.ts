import { AztecAddress, EthAddress, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation';
//import { randomBytes } from '@aztec/foundation';

export class TxRequest {
  constructor(
    public readonly from: AztecAddress,
    public readonly to: AztecAddress,
    public readonly functionData: FunctionData,
    public readonly args: Fr[],
    public readonly txContext: TxContext,
    public readonly nonce: Fr,
    public readonly chainId: Fr,
  ) {}

  toBuffer() {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(this.functionData.functionSelector);
    return Buffer.concat([
      buf,
      Buffer.concat(this.args.map(x => x.toBuffer())),
      this.nonce.toBuffer(),
      this.chainId.toBuffer(),
    ]);
  }
}

export class Signature {
  public static SIZE = 64;

  public static random() {
    return new EthAddress(randomBytes(Signature.SIZE));
  }

  constructor(public readonly buffer: Buffer) {}
}

// export function generateContractAddress(
//   deployerAddress: AztecAddress,
//   salt: Fr,
//   args: Fr[],
//   // functionLeaves: Fr[],
// ) {
//   return new Fr(randomBytes(32));
// }
