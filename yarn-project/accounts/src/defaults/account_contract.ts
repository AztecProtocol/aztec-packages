import type { AccountContract, AccountInterface, AuthWitnessProvider, ChainInfo } from '@aztec/aztec.js/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountInterface } from '../defaults/account_interface.js';

/**
 * Base class for implementing an account contract. Requires that the account uses the
 * default entrypoint method signature.
 */
export abstract class DefaultAccountContract implements AccountContract {
  abstract getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;
  abstract getInitializationFunctionAndArgs(): Promise<
    | {
        /** The name of the function used to initialize the contract */
        constructorName: string;
        /** The args to the function used to initialize the contract */
        constructorArgs: any[];
      }
    | undefined
  >;
  abstract getContractArtifact(): Promise<ContractArtifact>;

  constructor() {}

  getInterface(address: CompleteAddress, chainInfo: ChainInfo): AccountInterface {
    return new DefaultAccountInterface(this.getAuthWitnessProvider(address), address, chainInfo);
  }
}
