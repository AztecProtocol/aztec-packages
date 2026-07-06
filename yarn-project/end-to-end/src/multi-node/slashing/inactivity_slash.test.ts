import type { EthAddress } from '@aztec/aztec.js/addresses';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';
import 'jest-extended';

import { InactivityTest } from './inactivity_setup.js';

jest.setTimeout(1000 * 60 * 10);

// Inactivity slashing on the shared `InactivityTest` fixture (mock-gossip bus, 6 nodes, fake prover,
// epoch=2, proofSubEpochs=1024, sentinelEnabled).
describe('multi-node/slashing/inactivity_slash', () => {
  let test: InactivityTest;

  beforeAll(async () => {
    test = await InactivityTest.setup({
      slashInactivityConsecutiveEpochThreshold: 1,
      inactiveNodeCount: 1,
    });
  });

  afterAll(async () => {
    await test?.teardown();
  });

  // Basic inactivity slash path: one of 6 validators has its sequencer stopped; after one epoch of
  // inactivity (threshold=1) the sentinel detects the offense and the validator is slashed on L1.
  // Simple event-driven assertion; no polling inside the test body.
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
