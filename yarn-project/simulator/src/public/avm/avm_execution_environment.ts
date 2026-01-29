import { Fr } from '@aztec/foundation/curves/bn254';
import type { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import type { CallData } from './calldata.js';

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
    public readonly calldata: CallData,
    public readonly config: PublicSimulatorConfig,
  ) {}

  private deriveEnvironmentForNestedCallInternal(
    targetAddress: AztecAddress,
    calldata: CallData,
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
      this.config,
    );
  }

  public deriveEnvironmentForNestedCall(targetAddress: AztecAddress, calldata: CallData): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ false);
  }

  public deriveEnvironmentForNestedStaticCall(
    targetAddress: AztecAddress,
    calldata: CallData,
  ): AvmExecutionEnvironment {
    return this.deriveEnvironmentForNestedCallInternal(targetAddress, calldata, /*isStaticCall=*/ true);
  }
}
