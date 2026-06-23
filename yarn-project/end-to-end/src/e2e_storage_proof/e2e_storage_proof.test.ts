import { StorageProofTestContract } from '@aztec/noir-test-contracts.js/StorageProofTest';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { type EndToEndContext, setup, teardown } from '../fixtures/setup.js';
import { buildStorageProofCapsules, loadStorageProofArgs } from './fixtures/storage_proof_fixture.js';

jest.setTimeout(300_000);

// Tests that a Noir contract can verify an Ethereum storage proof (MPT proof) via oracle capsules.
// Plain setup(1, { ...AUTOMINE_E2E_OPTS }) with 1 account. Deploys StorageProofTestContract, then
// loads pre-computed proof args from fixtures/storage_proof.json and verifies on-chain.
describe('Storage proof', () => {
  let ctx: EndToEndContext;
  let contract: StorageProofTestContract;

  beforeAll(async () => {
    ctx = await setup(1, { ...AUTOMINE_E2E_OPTS });
    ({ contract } = await StorageProofTestContract.deploy(ctx.wallet).send({ from: ctx.accounts[0] }));
  });

  afterAll(async () => {
    await teardown(ctx);
  });

  // Loads pre-computed ethAddress/slotKey/slotContents/root from storage_proof.json, builds oracle
  // capsules pointing to the contract, and calls contract.storage_proof() which verifies the MPT
  // proof inside the circuit. Asserts execution succeeded.
  it('verifies a storage proof', async () => {
    const { ethAddress, slotKey, slotContents, root } = loadStorageProofArgs();
    const capsules = await buildStorageProofCapsules(contract.address);

    ctx.logger.info('Sending storage proof TX...');

    const { receipt } = await contract.methods
      .storage_proof(ethAddress, slotKey, slotContents, root)
      .with({ capsules })
      .send({ from: ctx.accounts[0] });

    expect(receipt.hasExecutionSucceeded()).toBe(true);
  });
});
