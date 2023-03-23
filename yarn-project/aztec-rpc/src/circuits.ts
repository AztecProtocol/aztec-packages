import { randomBytes } from './foundation.js';

export class Fr {
  public static ZERO = new Fr(Buffer.alloc(32));

  public static random() {
    return new Fr(randomBytes(32));
  }

  constructor(public readonly buffer: Buffer) {}
}

export class EthAddress {
  public static ZERO = new EthAddress(Buffer.alloc(20));

  public static random() {
    return new EthAddress(randomBytes(20));
  }

  public static fromString(address: string) {
    return new EthAddress(Buffer.from(address.replace(/^0x/i, ''), 'hex'));
  }

  constructor(public readonly buffer: Buffer) {}
}

export class AztecAddress {
  public static SIZE = 64;

  public static ZERO = new AztecAddress(Buffer.alloc(AztecAddress.SIZE));

  public static random() {
    return new AztecAddress(randomBytes(AztecAddress.SIZE));
  }

  constructor(public readonly buffer: Buffer) {}

  public equals(rhs: AztecAddress) {
    return this.buffer.equals(rhs.buffer);
  }
}

export class Signature {
  public static SIZE = 64;

  public static random() {
    return new EthAddress(randomBytes(Signature.SIZE));
  }

  constructor(public readonly buffer: Buffer) {}
}

export interface FunctionData {
  functionSelector: Buffer;
  isSecret: boolean;
  isContructor: boolean;
}

export class ContractDeploymentData {
  public static EMPTY = new ContractDeploymentData(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);

  constructor(
    public readonly contractDataHash: Fr,
    public readonly functionTreeRoot: Fr,
    public readonly constructorHash: Fr,
    public readonly contractAddressSalt: Fr,
    public readonly portalContractAddress: Fr,
  ) {}
}

export class TxContext {
  constructor(
    public readonly isFeePaymentTx: boolean,
    public readonly isRebatePaymentTx: boolean,
    public readonly isContractDeploymentTx: boolean,
    public readonly contractDeploymentData: ContractDeploymentData,
  ) {}
}

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

export class PreviousKernelData {}

export class PrivateCallData {}

export class AccumulatedTxData {}

export class KernelPrivateInputs {
  constructor(
    public readonly txRequest: TxRequest,
    public readonly signature: Signature,
    public readonly previousKernelData: PreviousKernelData,
    public readonly privateCallData: PrivateCallData,
  ) {}
}

export class KernelProofData {
  public readonly accumulatedTxData: AccumulatedTxData;

  constructor(public readonly proofData: Buffer) {
    this.accumulatedTxData = new AccumulatedTxData();
  }
}

export class KernelCircuitProver {
  public createProof(inputs: KernelPrivateInputs) {
    return Promise.resolve(new KernelProofData(Buffer.alloc(100)));
  }
}

export function generateContractAddress(
  deployerAddress: AztecAddress,
  salt: Fr,
  args: Fr[],
  // functionLeaves: Fr[],
) {
  return AztecAddress.random();
}
