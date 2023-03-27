import { AztecAddress, Fr, FunctionData, PrivateCircuitPublicInputs, TxContext } from '@aztec/circuits.js';

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
    return Buffer.alloc(0);
  }
}

export class PrivateCallStackItem {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly functionSelector: number,
    public readonly publicInputs: PrivateCircuitPublicInputs,
  ) {}
}
