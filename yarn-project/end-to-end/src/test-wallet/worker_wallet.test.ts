import type { ContractArtifact } from '@aztec/stdlib/abi';
import { DEV_VERSION } from '@aztec/stdlib/update-checker';

import { jest } from '@jest/globals';

import { WorkerWallet } from './worker_wallet.js';

const mockArtifact: ContractArtifact = {
  name: 'TestContract',
  aztecVersion: DEV_VERSION,
  functions: [],
  nonDispatchPublicFunctions: [],
  outputs: { structs: {}, globals: {} },
  fileMap: {},
  storageLayout: {},
};

describe('WorkerWallet', () => {
  const createWorkerWallet = (request: (payload: unknown) => Promise<unknown>): WorkerWallet =>
    Reflect.construct(WorkerWallet, [{ terminate: jest.fn() }, { request, close: jest.fn() }]) as WorkerWallet;

  it('handles void results from the worker transport', async () => {
    const request = async () => undefined;
    const wallet = createWorkerWallet(request);

    await expect(wallet.registerContractClass(mockArtifact)).resolves.toBeUndefined();
  });
});
