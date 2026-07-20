import { type Account, type AccountContract, type AuthWitnessProvider, BaseAccount } from '@aztec/aztec.js/account';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

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

  /**
   * Accounts without immutables (the default) contribute to their address via an on-chain
   * initializer instead. Account contracts that commit immutables into their address override this.
   */
  getImmutablesHash(): Promise<Fr | undefined> {
    return Promise.resolve(undefined);
  }

  getAccount(completeAddress: CompleteAddress): Account {
    const authWitnessProvider = this.getAuthWitnessProvider(completeAddress);
    return new BaseAccount(
      new DefaultAccountEntrypoint(completeAddress.address, authWitnessProvider),
      authWitnessProvider,
      completeAddress,
    );
  }
}
