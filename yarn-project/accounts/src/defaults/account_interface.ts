import type { AccountInterface, AuthWitnessProvider } from '@aztec/aztec.js/account';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import type { EntrypointInterface, FeeOptions, TxExecutionOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { NodeInfo } from '@aztec/stdlib/contract';
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
    nodeInfo: Pick<NodeInfo, 'l1ChainId' | 'rollupVersion'>,
  ) {
    this.entrypoint = new DefaultAccountEntrypoint(
      address.address,
      authWitnessProvider,
      nodeInfo.l1ChainId,
      nodeInfo.rollupVersion,
    );
    this.chainId = new Fr(nodeInfo.l1ChainId);
    this.version = new Fr(nodeInfo.rollupVersion);
  }

  createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, fee, options);
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
