import type { ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { ExecutionPayload, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Account } from './account.js';

/**
 * Account implementation which creates a transaction using the multicall protocol contract as entrypoint.
 */
export class SignerlessAccount implements Account {
  private entrypoint: EntrypointInterface;

  constructor() {
    this.entrypoint = new DefaultMultiCallEntrypoint();
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
    throw new Error('SignerlessAccount: Method createAuthWit not implemented.');
  }

  getCompleteAddress(): CompleteAddress {
    throw new Error('SignerlessAccount: Method getCompleteAddress not implemented.');
  }

  getAddress(): AztecAddress {
    throw new Error('SignerlessAccount: Method getAddress not implemented.');
  }
}
