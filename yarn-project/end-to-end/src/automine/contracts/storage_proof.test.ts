import { StorageProofTestContract } from '@aztec/noir-test-contracts.js/StorageProofTest';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';
import { buildStorageProofCapsules, loadStorageProofArgs } from './fixtures/storage_proof_fixture.js';

jest.setTimeout(300_000);

// Tests that a Noir contract can verify an Ethereum storage proof (MPT proof) via oracle capsules.
// Deploys StorageProofTestContract, then loads pre-computed proof args from fixtures/storage_proof.json
// and verifies on-chain.
describe('automine/contracts/storage_proof', () => {
  const t = new AutomineTestContext();
  let contract: StorageProofTestContract;

  beforeAll(async () => {
    await t.setup({ numberOfAccounts: 1 });
    ({ contract } = await StorageProofTestContract.deploy(t.wallet).send({ from: t.defaultAccountAddress }));
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Loads pre-computed ethAddress/slotKey/slotContents/root from storage_proof.json, builds oracle
  // capsules pointing to the contract, and calls contract.storage_proof() which verifies the MPT
  // proof inside the circuit. Asserts execution succeeded.
  it('verifies a storage proof', async () => {
    const { ethAddress, slotKey, slotContents, root } = loadStorageProofArgs();
    const capsules = await buildStorageProofCapsules(contract.address);

    t.logger.info('Sending storage proof TX...');

    const { receipt } = await contract.methods
      .storage_proof(ethAddress, slotKey, slotContents, root)
      .with({ capsules })
      .send({ from: t.defaultAccountAddress });

    expect(receipt.hasExecutionSucceeded()).toBe(true);
  });
});
