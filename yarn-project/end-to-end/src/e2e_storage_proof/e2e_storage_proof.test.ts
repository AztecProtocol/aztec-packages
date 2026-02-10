import { StorageProofTestContract } from '@aztec/noir-test-contracts.js/StorageProofTest';

import { jest } from '@jest/globals';

import { type EndToEndContext, setup, teardown } from '../fixtures/setup.js';
import { buildStorageProofCapsules, loadStorageProofArgs } from './fixtures/storage_proof_fixture.js';

jest.setTimeout(300_000);

describe('Storage proof', () => {
  let ctx: EndToEndContext;
  let contract: StorageProofTestContract;

  beforeAll(async () => {
    ctx = await setup(1);
    contract = await StorageProofTestContract.deploy(ctx.wallet).send({ from: ctx.accounts[0] });
  });

  afterAll(async () => {
    await teardown(ctx);
  });

  it('verifies a storage proof', async () => {
    const { ethAddress, slotKey, slotContents, root } = loadStorageProofArgs();
    const capsules = await buildStorageProofCapsules(contract.address);

    ctx.logger.info('Sending storage proof TX...');

    const receipt = await contract.methods
      .storage_proof(ethAddress, slotKey, slotContents, root)
      .with({ capsules })
      .send({ from: ctx.accounts[0] });

    expect(receipt.hasExecutionSucceeded()).toBe(true);
  });
});
