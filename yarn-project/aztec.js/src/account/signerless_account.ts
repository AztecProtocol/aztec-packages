import type { ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { Account } from './account.js';

/**
 * Account implementation which creates a transaction using the multicall protocol contract as entrypoint.
 */
export class SignerlessAccount implements Account {
  private entrypoint: EntrypointInterface;
  constructor(chainInfo: ChainInfo) {
    this.entrypoint = new DefaultMultiCallEntrypoint(chainInfo.chainId.toNumber(), chainInfo.version.toNumber());
  }

  createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, gasSettings);
  }

  getChainId(): Fr {
    throw new Error('SignerlessAccount: Method getChainId not implemented.');
  }

  getVersion(): Fr {
    throw new Error('SignerlessAccount: Method getVersion not implemented.');
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
}
