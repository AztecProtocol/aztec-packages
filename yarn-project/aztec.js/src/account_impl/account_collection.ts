import { AztecAddress, TxContext } from '@aztec/circuits.js';
import { ExecutionRequest, TxExecutionRequest } from '@aztec/types';
import { AccountImplementation } from './index.js';

export class AccountCollection implements AccountImplementation {
  private accounts: Map<AztecAddress, AccountImplementation> = new Map();

  public registerAccount(addr: AztecAddress, impl: AccountImplementation) {
    this.accounts.set(addr, impl);
  }

  getAddress(): AztecAddress {
    if (!this.accounts) throw new Error(`No accounts registered`);
    return this.accounts.keys().next().value as AztecAddress;
  }

  public createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<TxExecutionRequest> {
    // TODO: Check all executions have the same origin
    const sender = executions[0].from;
    const impl = this.accounts.get(sender);
    if (!impl) throw new Error(`No account implementation registered for ${sender}`);
    return impl.createAuthenticatedTxRequest(executions, txContext);
  }
}
