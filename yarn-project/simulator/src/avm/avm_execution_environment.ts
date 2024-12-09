import { type GlobalVariables } from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

/**
 * Contains variables that remain constant during AVM execution
 * These variables are provided by the public kernel circuit
 */
export class AvmExecutionEnvironment {
  constructor(
    public readonly address: AztecAddress,
    public readonly sender: AztecAddress,
    public readonly fnName: string,
    public readonly contractCallDepth: Fr,
    public readonly transactionFee: Fr,
    public readonly globals: GlobalVariables,
    public readonly isStaticCall: boolean,
    public readonly calldata: Fr[],
  ) {}

  private deriveEnvironmentForNestedCallInternal(
    targetAddress: AztecAddress,
    calldata: Fr[],
    fnName: string,
    isStaticCall: boolean,
  ) {
    return new AvmExecutionEnvironment(
      /*address=*/ targetAddress,
      /*sender=*/ this.address,
      fnName,
      this.contractCallDepth.add(Fr.ONE),
      this.transactionFee,
      this.globals,
      isStaticCall,
      calldata,
    );
  }

  public deriveEnvironmentForNestedCall(
    targetAddress: AztecAddress,
    calldata: Fr[],
    fnName: string,
  ): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, fnName, /*isStaticCall=*/ false);
  }

  public deriveEnvironmentForNestedStaticCall(
    targetAddress: AztecAddress,
    calldata: Fr[],
    fnName: string,
  ): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, fnName, /*isStaticCall=*/ true);
  }
}
