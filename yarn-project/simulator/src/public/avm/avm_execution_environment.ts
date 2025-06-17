import { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasFees } from '@aztec/stdlib/gas';
import type { GlobalVariables } from '@aztec/stdlib/tx';

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
    public readonly effectiveGasFees: GasFees,
    public readonly clientInitiatedSimulation: boolean = false,
  ) {}

  private deriveEnvironmentForNestedCallInternal(
    targetAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
  ): AvmExecutionEnvironment {
    return new AvmExecutionEnvironment(
      /*address=*/ targetAddress,
      /*sender=*/ this.address,
      this.contractCallDepth.add(Fr.ONE),
      this.transactionFee,
      this.globals,
      isStaticCall,
      calldata,
      this.effectiveGasFees,
      /*clientInitiatedSimulation=*/ this.clientInitiatedSimulation,
    );
  }

  public deriveEnvironmentForNestedCall(targetAddress: AztecAddress, calldata: Fr[]): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ false);
  }

  public deriveEnvironmentForNestedStaticCall(targetAddress: AztecAddress, calldata: Fr[]): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ true);
  }
}
