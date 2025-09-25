import type { EntrypointInterface, FeeOptions, TxExecutionOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Wallet } from '../wallet/wallet.js';
import type { Account } from './account.js';

/**
 * Wallet implementation which creates a transaction request directly to the requested contract without any signing.
 */
export class SignerlessAccount implements Account {
  constructor(private entrypoint: EntrypointInterface) {}

  createTxExecutionRequest(
    execution: ExecutionPayload,
    feeOptions: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(execution, feeOptions, options);
  }

  getChainId(): Fr {
    throw new Error('SignerlessAccount: Method getChainId not implemented.');
  }

  getVersion(): Fr {
    throw new Error('SignerlessAccount: Method getVersion not implemented.');
  }

  getPublicKeysHash(): Fr {
    throw new Error('SignerlessAccount: Method getPublicKeysHash not implemented.');
  }

  getCompleteAddress(): CompleteAddress {
    throw new Error('SignerlessAccount: Method getCompleteAddress not implemented.');
  }

  getAddress(): AztecAddress {
    throw new Error('SignerlessAccount: Method getAddress not implemented.');
  }

  createAuthWit(_intent: Fr | Buffer | IntentInnerHash | CallIntent): Promise<AuthWitness> {
    throw new Error('SignerlessAccount: Method createAuthWit not implemented.');
  }

  setPublicAuthWit(
    _wallet: Wallet,
    _messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent,
    _authorized: boolean,
  ): Promise<ContractFunctionInteraction> {
    throw new Error('SignerlessAccount: Method setPublicAuthWit not implemented.');
  }
}
