import type { EthAddress } from '@aztec/aztec.js';
import { unique } from '@aztec/foundation/collection';

import { jest } from '@jest/globals';
import 'jest-extended';

import { P2PInactivityTest } from './inactivity_slash_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_inactivity_slash_with_consecutive_epochs', () => {
  let test: P2PInactivityTest;

  const slashInactivityConsecutiveEpochThreshold = 3;

  beforeAll(async () => {
    test = await P2PInactivityTest.create('e2e_p2p_inactivity_slash_with_consecutive_epochs', {
      slashInactivityConsecutiveEpochThreshold,
      inactiveNodeCount: 2,
    }).then(t => t.setup());
  });

  afterAll(async () => {
    await test?.teardown();
  });

  it('only slashes validator inactive for N consecutive epochs', async () => {
    const [offlineValidator, reenabledValidator] = test.offlineValidators;
    const { aztecEpochDuration, slashingExecutionDelayInRounds, slashingOffsetInRounds, slashingRoundSizeInEpochs } =
      test.ctx.aztecNodeConfig;

    const initialEpoch = Number(test.test.monitor.l2EpochNumber) + 1;
    test.logger.warn(`Waiting until end of epoch ${initialEpoch} to reenable validator ${reenabledValidator}`);
    await test.test.monitor.waitUntilL2Slot(initialEpoch * aztecEpochDuration);

    test.logger.warn(`Re-enabling offline validator ${reenabledValidator}`);
    const reenabledNode = test.nodes.at(-1)!;
    expect(reenabledNode.getSequencer()!.validatorAddresses![0].toString()).toEqual(reenabledValidator.toString());
    await reenabledNode.getSequencer()!.start();

    test.logger.warn(`Expecting offline validator ${offlineValidator} to be slashed but not ${reenabledValidator}`);
    const slashed: EthAddress[] = [];
    test.rollup.listenToSlash(args => {
      test.logger.warn(`Slashed ${args.attester.toString()}`);
      slashed.push(args.attester);
    });

    // Wait until after the slashing would have executed for inactivity plus a bit for good measure
    const targetEpoch =
      initialEpoch +
      slashInactivityConsecutiveEpochThreshold +
      (slashingExecutionDelayInRounds + slashingOffsetInRounds) * slashingRoundSizeInEpochs +
      5;
    test.logger.warn(`Waiting until slot ${aztecEpochDuration * targetEpoch} (epoch ${targetEpoch})`);
    await test.test.monitor.waitUntilL2Slot(aztecEpochDuration * targetEpoch);
    expect(unique(slashed.map(addr => addr.toString()))).toEqual([offlineValidator.toString()]);
  });
});
