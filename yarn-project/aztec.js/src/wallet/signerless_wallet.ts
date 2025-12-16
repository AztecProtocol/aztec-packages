import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import type { EntrypointInterface, FeeOptions, TxExecutionOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';
import { BaseWallet } from './base_wallet.js';

/**
 * Wallet implementation which creates a transaction request directly to the requested contract without any signing.
 */
export class SignerlessWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    private entrypoint?: EntrypointInterface,
  ) {
    super(pxe);
  }
  async createTxExecutionRequest(
    execution: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    let entrypoint = this.entrypoint;
    if (!entrypoint) {
      const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
      entrypoint = new DefaultEntrypoint(chainId, rollupVersion);
    }

    return entrypoint.createTxExecutionRequest(execution, fee, options);
  }

  getChainId(): Fr {
    throw new Error('SignerlessWallet: Method getChainId not implemented.');
  }

  getVersion(): Fr {
    throw new Error('SignerlessWallet: Method getVersion not implemented.');
  }

  getPublicKeysHash(): Fr {
    throw new Error('SignerlessWallet: Method getPublicKeysHash not implemented.');
  }

  getCompleteAddress(): CompleteAddress {
    throw new Error('SignerlessWallet: Method getCompleteAddress not implemented.');
  }

  createAuthWit(_intent: Fr | Buffer | IntentInnerHash | IntentAction): Promise<AuthWitness> {
    throw new Error('SignerlessWallet: Method createAuthWit not implemented.');
  }
}
