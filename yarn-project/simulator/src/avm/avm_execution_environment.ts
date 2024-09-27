import { FunctionSelector, type GlobalVariables, type Header } from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

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
    public readonly isDelegateCall: boolean,
    public readonly calldata: Fr[],
  ) {}

  private deriveEnvironmentForNestedCallInternal(
    targetAddress: AztecAddress,
    calldata: Fr[],
    functionSelector: FunctionSelector,
    isStaticCall: boolean,
    isDelegateCall: boolean,
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
      isDelegateCall,
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
      /*isDelegateCall=*/ false,
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
      /*isDelegateCall=*/ false,
    );
  }

  public newDelegateCall(
    _targetAddress: AztecAddress,
    _calldata: Fr[],
    _functionSelector: FunctionSelector,
  ): AvmExecutionEnvironment {
    throw new Error('Delegate calls not supported!');
  }
}
