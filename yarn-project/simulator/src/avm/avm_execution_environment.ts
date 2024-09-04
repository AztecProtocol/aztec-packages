import { FunctionSelector, type GlobalVariables, type Header } from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

export class AvmContextInputs {
  static readonly SIZE = 2;

  constructor(private argsHash: Fr, private isStaticCall: boolean) {}

  public toFields(): Fr[] {
    return [this.argsHash, new Fr(this.isStaticCall)];
  }
}

/**
 * Contains variables that remain constant during AVM execution
 * These variables are provided by the public kernel circuit
 */
export class AvmExecutionEnvironment {
  constructor(
    public readonly address: AztecAddress,
    public readonly storageAddress: AztecAddress,
    public readonly sender: AztecAddress,
    public readonly functionSelector: FunctionSelector, // may be temporary (#7224)
    public readonly contractCallDepth: Fr,
    public readonly transactionFee: Fr,
    public readonly header: Header,
    public readonly globals: GlobalVariables,
    public readonly isStaticCall: boolean,
    public readonly calldata: Fr[],
  ) {
    // We encode some extra inputs (AvmContextInputs) in calldata.
    // This will have to go once we move away from one proof per call.
    const inputs = new AvmContextInputs(computeVarArgsHash(calldata), isStaticCall).toFields();
    this.calldata = [...inputs, ...calldata];
  }

  private deriveEnvironmentForNestedCallInternal(
    targetAddress: AztecAddress,
    calldata: Fr[],
    functionSelector: FunctionSelector,
    isStaticCall: boolean,
  ) {
    return new AvmExecutionEnvironment(
      /*address=*/ targetAddress,
      /*storageAddress=*/ targetAddress,
      /*sender=*/ this.address,
      functionSelector,
      this.contractCallDepth.add(Fr.ONE),
      this.transactionFee,
      this.header,
      this.globals,
      isStaticCall,
      calldata,
    );
  }

  public deriveEnvironmentForNestedCall(
    targetAddress: AztecAddress,
    calldata: Fr[],
    functionSelector: FunctionSelector = FunctionSelector.empty(),
  ): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(
      targetAddress,
      calldata,
      functionSelector,
      /*isStaticCall=*/ false,
    );
  }

  public deriveEnvironmentForNestedStaticCall(
    targetAddress: AztecAddress,
    calldata: Fr[],
    functionSelector: FunctionSelector,
  ): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(
      targetAddress,
      calldata,
      functionSelector,
      /*isStaticCall=*/ true,
    );
  }

  public getCalldataWithoutPrefix(): Fr[] {
    // clip off the first few entries
    return this.calldata.slice(AvmContextInputs.SIZE);
  }
}
