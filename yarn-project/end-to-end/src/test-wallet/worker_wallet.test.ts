import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { ContractInstancePreimage } from '@aztec/stdlib/contract';

import { WorkerWallet } from './worker_wallet.js';

describe('WorkerWallet', () => {
  // The private constructor spawns a worker; call() only touches the transport client, so we build the
  // instance directly with a stub client and never start a worker.
  const walletRespondingWith = (requestResult: unknown): WorkerWallet => {
    const client = { request: () => Promise.resolve(requestResult) };
    return Reflect.construct(WorkerWallet, [undefined, client]);
  };

  // registerContract / registerContractClass return void, which the worker serializes as `undefined`.
  // Feeding that to JSON.parse throws `"undefined" is not valid JSON` — the crash that failed every
  // inclusion-sweep bench point during setup.
  it('resolves a void-returning method when the worker responds with undefined', async () => {
    const wallet = walletRespondingWith(undefined);
    await expect(wallet.registerContract({} as ContractInstancePreimage)).resolves.toBeUndefined();
    await expect(wallet.registerContractClass({} as ContractArtifact)).resolves.toBeUndefined();
  });
});
