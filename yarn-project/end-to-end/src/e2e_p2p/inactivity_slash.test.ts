import type { EthAddress } from '@aztec/aztec.js';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';
import 'jest-extended';

import { P2PInactivityTest } from './inactivity_slash_test.js';

jest.setTimeout(1000 * 60 * 10);

const SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD = 1;

describe('e2e_p2p_inactivity_slash', () => {
  let test: P2PInactivityTest;

  beforeAll(async () => {
    test = await P2PInactivityTest.create('e2e_p2p_inactivity_slash', {
      slashInactivityConsecutiveEpochThreshold: SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD,
      inactiveNodeCount: 1,
      keepInitialNode: false,
    }).then(t => t.setup());
  });

  afterAll(async () => {
    await test?.teardown();
  });

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
