import { AztecAddress } from '@aztec/circuits.js';
import { FunctionCall, TxExecutionRequest } from '@aztec/types';

import { AccountImplementation, CreateTxRequestOpts } from './index.js';

/**
 * A concrete account implementation that manages multiple accounts.
 */
export class AccountCollection implements AccountImplementation {
  private accounts: Map<string, AccountImplementation> = new Map();

  /**
   * Registers an account implementation against an aztec address
   * @param addr - The aztec address agianst which to register the implementation.
   * @param impl - The account implementation to be registered.
   */
  public registerAccount(addr: AztecAddress, impl: AccountImplementation) {
    this.accounts.set(addr.toString(), impl);
  }

  public createTxExecutionRequest(
    executions: FunctionCall[],
    opts: CreateTxRequestOpts = {},
  ): Promise<TxExecutionRequest> {
    const defaultAccount = this.accounts.values().next().value as AccountImplementation;
    const impl = opts.origin ? this.accounts.get(opts.origin.toString()) : defaultAccount;
    if (!impl) throw new Error(`No account implementation registered for ${opts.origin}`);
    return impl.createTxExecutionRequest(executions, opts);
  }
}
