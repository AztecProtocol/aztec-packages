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
    public readonly contractCallDepth: Fr,
    public readonly transactionFee: Fr,
    public readonly globals: GlobalVariables,
    public readonly isStaticCall: boolean,
    public readonly calldata: Fr[],
  ) {}

  private deriveEnvironmentForNestedCallInternal(targetAddress: AztecAddress, calldata: Fr[], isStaticCall: boolean) {
    return new AvmExecutionEnvironment(
      /*address=*/ targetAddress,
      /*sender=*/ this.address,
      this.contractCallDepth.add(Fr.ONE),
      this.transactionFee,
      this.globals,
      isStaticCall,
      calldata,
    );
  }

  public deriveEnvironmentForNestedCall(targetAddress: AztecAddress, calldata: Fr[]): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ false);
  }

  public deriveEnvironmentForNestedStaticCall(targetAddress: AztecAddress, calldata: Fr[]): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ true);
  }
}
