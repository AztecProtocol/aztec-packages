import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { computeContractAddressFromInstance } from '@aztec/stdlib/contract';

import type { AccountContract } from '../account/account_contract.js';
import { testContractArtifact } from '../test/fixtures.js';
import { AccountManager } from './account_manager.js';
import type { Wallet } from './wallet.js';

class StubAccountContract implements AccountContract {
  constructor(private readonly artifact: ContractArtifact) {}

  getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(this.artifact);
  }

  getInitializationFunctionAndArgs() {
    return Promise.resolve(undefined);
  }

  getAccount(): never {
    throw new Error('not used in this test');
  }

  getAuthWitnessProvider(): never {
    throw new Error('not used in this test');
  }
}

describe('AccountManager.create', () => {
  const wallet = {} as Wallet;
  const accountContract = new StubAccountContract({ ...testContractArtifact, functions: [] });
  const secretKey = Fr.random();
  const salt = Fr.random();

  it('defaults immutablesHash to Fr.ZERO when no opts are provided', async () => {
    const manager = await AccountManager.create(wallet, secretKey, accountContract, salt);
    const instance = manager.getInstance();
    expect(instance.immutablesHash).toEqual(Fr.ZERO);
    expect(instance.address).toEqual(await computeContractAddressFromInstance(instance));
  });

  it('plumbs immutablesHash into the resulting instance and address', async () => {
    const immutablesHash = Fr.random();
    const manager = await AccountManager.create(wallet, secretKey, accountContract, salt, { immutablesHash });
    const instance = manager.getInstance();
    expect(instance.immutablesHash).toEqual(immutablesHash);
    expect(instance.address).toEqual(await computeContractAddressFromInstance(instance));
  });

  it('produces a different address when immutablesHash changes', async () => {
    const baseline = await AccountManager.create(wallet, secretKey, accountContract, salt);
    const withImmutables = await AccountManager.create(wallet, secretKey, accountContract, salt, {
      immutablesHash: new Fr(42n),
    });
    expect(withImmutables.address).not.toEqual(baseline.address);
  });
});
