import { EthAddress } from '@aztec/aztec.js/addresses';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';
import 'jest-extended';

import { InactivityTest } from './inactivity_setup.js';

jest.setTimeout(1000 * 60 * 10);

const SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD = 1;

// Verifies the basic inactivity slash path: one of 6 validators has its sequencer stopped; after
// slashInactivityConsecutiveEpochThreshold=1 epoch of inactivity the sentinel detects the offense and
// the validator is slashed on L1. Uses MultiNodeTestContext on the mock-gossip bus (6 nodes, fake
// prover, ethSlot varies by CI env, epoch=2, proofSubEpochs=1024, sentinelEnabled).
describe('multi-node/slashing/inactivity_slash', () => {
  let test: InactivityTest;

  beforeAll(async () => {
    test = await InactivityTest.setup({
      slashInactivityConsecutiveEpochThreshold: SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD,
      inactiveNodeCount: 1,
    });
  });

  afterAll(async () => {
    await test?.teardown();
  });

  // Waits for a Slash event on the rollup contract and asserts it targets the offline validator with
  // the expected slashing amount. Simple event-driven assertion; no polling inside the test body.
  it('slashes inactive validator', async () => {
    const slashPromise = promiseWithResolvers<{ amount: bigint; attester: EthAddress }>();
    test.rollup.listenToSlash(args => {
      test.logger.warn(`Slashed ${args.attester.toString()}`);
      slashPromise.resolve(args);
    });
    const { amount, attester } = await slashPromise.promise;
    expect(test.offlineValidators[0].toString()).toEqual(attester.toString());
    expect(amount).toEqual(test.slashingAmount);
  });
});
