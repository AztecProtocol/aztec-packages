import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import type { ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { ExecutionPayload, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Account } from './account.js';

/**
 * Implements the Account interface for direct execution without an account contract.
 * Uses DefaultEntrypoint to execute a single private call as-is, with standard
 * encoding conventions for aztec private functions. No authentication wrapping is performed.
 *
 * Used when the caller opts out of account contract mediation via NO_FROM.
 * The app is responsible for assembling the complete execution payload (including
 * any entrypoint wrapping like multicall) before handing it off.
 */
export class NoAccount implements Account {
  private entrypoint: EntrypointInterface;

  constructor() {
    this.entrypoint = new DefaultEntrypoint();
  }

  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, gasSettings, chainInfo);
  }

  wrapExecutionPayload(exec: ExecutionPayload, options?: any): Promise<ExecutionPayload> {
    return this.entrypoint.wrapExecutionPayload(exec, options);
  }

  createAuthWit(_intent: Fr | Buffer | IntentInnerHash | CallIntent): Promise<AuthWitness> {
    throw new Error('NoAccount does not support creating auth witnesses.');
  }

  getCompleteAddress(): CompleteAddress {
    throw new Error('NoAccount does not have a complete address.');
  }

  getAddress(): AztecAddress {
    throw new Error('NoAccount does not have an address.');
  }
}
