import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { AuthWitnessProvider, ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { ExecutionPayload, TxExecutionRequest } from '@aztec/stdlib/tx';

import { type CallIntent, type IntentInnerHash, computeAuthWitMessageHash } from '../utils/authwit.js';

/**
 * Provides authorization for actions via the AuthWitness mechanism.
 */
export interface AuthorizationProvider {
  /**
   * Creates an authentication witness from an inner hash with consumer, or a call intent
   * @param intent - The action (or inner hash) to authorize
   * @param chainInfo - Chain information needed for message hash computation
   */
  createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo): Promise<AuthWitness>;
}

// docs:start:account-interface
/**
 * Minimal interface for transaction execution and authorization.
 */
export type Account = EntrypointInterface &
  AuthorizationProvider & {
    /** Returns the complete address for this account. */
    getCompleteAddress(): CompleteAddress;
    /** Returns the address for this account. */
    getAddress(): AztecAddress;
  };
// docs:end:account-interface

/**
 * An account implementation that uses authwits as an authentication mechanism
 * and can assemble transaction execution requests for an entrypoint.
 */
export class BaseAccount implements Account {
  constructor(
    private entrypoint: EntrypointInterface,
    private authWitnessProvider: AuthWitnessProvider,
    private completeAddress: CompleteAddress,
  ) {}

  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, gasSettings, chainInfo, options);
  }

  wrapExecutionPayload(exec: ExecutionPayload, options?: any): Promise<ExecutionPayload> {
    return this.entrypoint.wrapExecutionPayload(exec, options);
  }

  async createAuthWit(messageHashOrIntent: CallIntent | IntentInnerHash, chainInfo: ChainInfo): Promise<AuthWitness> {
    const messageHash = await computeAuthWitMessageHash(messageHashOrIntent, chainInfo);
    return this.authWitnessProvider.createAuthWit(messageHash);
  }

  getCompleteAddress(): CompleteAddress {
    return this.completeAddress;
  }

  getAddress(): AztecAddress {
    return this.completeAddress.address;
  }
}
