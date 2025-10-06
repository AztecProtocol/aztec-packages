import type { AccountInterface, AuthWitnessProvider } from '@aztec/aztec.js/account';
import { DefaultAccountEntrypoint, type DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

/**
 * Default implementation for an account interface. Requires that the account uses the default
 * entrypoint signature, which accept an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
 */
export class DefaultAccountInterface implements AccountInterface {
  protected entrypoint: EntrypointInterface;

  private chainId: Fr;
  private version: Fr;

  constructor(
    private authWitnessProvider: AuthWitnessProvider,
    private address: CompleteAddress,
    chainInfo: ChainInfo,
  ) {
    this.entrypoint = new DefaultAccountEntrypoint(
      address.address,
      authWitnessProvider,
      chainInfo.chainId.toNumber(),
      chainInfo.version.toNumber(),
    );
    this.chainId = chainInfo.chainId;
    this.version = chainInfo.version;
  }

  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, gasSettings, options);
  }

  createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    return this.authWitnessProvider.createAuthWit(messageHash);
  }

  getCompleteAddress(): CompleteAddress {
    return this.address;
  }

  getAddress(): AztecAddress {
    return this.address.address;
  }

  getChainId(): Fr {
    return this.chainId;
  }

  getVersion(): Fr {
    return this.version;
  }
}
