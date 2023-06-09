import { AztecAddress, Fr, TxContext } from '@aztec/circuits.js';
import { KeyStore } from '@aztec/key-store';
import { ExecutionRequest, SignedTxExecutionRequest, TxExecutionRequest } from '@aztec/types';
import { AccountImplementation } from './index.js';

export class EcdsaExternallyOwnedAccount implements AccountImplementation {
  constructor(private address: AztecAddress, private keyStore: KeyStore) {}

  async createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<SignedTxExecutionRequest> {
    if (executions.length !== 1) throw new Error(`EOAs can only submit a single execution at a time`);
    const [execution] = executions;

    if (!execution.from.equals(this.address)) throw new Error(`Sender does not match account address`);

    const txExecRequest = new TxExecutionRequest(
      this.address,
      execution.to,
      execution.functionData,
      execution.args,
      Fr.random(),
      txContext,
      Fr.ZERO,
    );
    const txRequest = await txExecRequest.toTxRequest();
    const toSign = txRequest.toBuffer();
    const signature = await this.keyStore.ecdsaSign(toSign, execution.from);
    return new SignedTxExecutionRequest(txExecRequest, signature);
  }
}
