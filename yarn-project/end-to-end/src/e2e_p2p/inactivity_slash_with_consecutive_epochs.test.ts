import type { EthAddress } from '@aztec/aztec.js/addresses';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { unique } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { OffenseType } from '@aztec/slasher';

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

    const {
      aztecEpochDuration,
      slashingExecutionDelayInRounds,
      slashingOffsetInRounds,
      slashingRoundSizeInEpochs,
      aztecSlotDuration,
    } = test.ctx.aztecNodeConfig;

    const initialEpoch = Number(test.test.monitor.l2EpochNumber) + 1;
    test.logger.warn(`Waiting until end of epoch ${initialEpoch} to reenable validator ${reenabledValidator}`);
    await test.test.monitor.waitUntilL2Slot(SlotNumber(initialEpoch * aztecEpochDuration));

    test.logger.warn(`Re-enabling offline validator ${reenabledValidator}`);
    const reenabledNode = test.nodes.at(-1)!;
    expect(reenabledNode.getSequencer()!.validatorAddresses![0].toString()).toEqual(reenabledValidator.toString());
    await reenabledNode.getSequencer()!.start();

    test.logger.warn(`Waiting until offenses are created for ${offlineValidator}`);
    const offenses = await retryUntil(
      async () => {
        const offenses = await test.activeNodes[0].getSlashOffenses('all');
        return offenses.length > 0 ? offenses : undefined;
      },
      'slash offenses',
      slashInactivityConsecutiveEpochThreshold * aztecEpochDuration * aztecSlotDuration * 2,
    );
    expect(unique(offenses.map(o => o.validator.toString()))).toEqual([offlineValidator.toString()]);
    expect(unique(offenses.map(o => o.offenseType))).toEqual([OffenseType.INACTIVITY]);

    test.logger.warn(`Expecting offline validator ${offlineValidator} to be slashed but not ${reenabledValidator}`);
    const slashed: EthAddress[] = [];
    test.rollup.listenToSlash(args => {
      test.logger.warn(`Slashed ${args.attester.toString()}`);
      slashed.push(args.attester);
    });

    // Wait until after the slashing would have executed for inactivity
    // Note that this may take some time if the offline validator is elected as proposer enough times
    // that we never get to collect enough votes in a round to trigger the slash
    const attemptsInRounds = 3;
    const delayInEpochs =
      attemptsInRounds * slashingRoundSizeInEpochs + // How many rounds to wait until the slash is voted
      (slashingExecutionDelayInRounds + slashingOffsetInRounds) * slashingRoundSizeInEpochs + // Wait for execution delay
      4; // A bit extra

    const timeout = delayInEpochs * aztecEpochDuration * aztecSlotDuration;
    test.logger.warn(`Waiting ${timeout}s (${delayInEpochs} epochs) until for slash`);
    await retryUntil(
      () => slashed.length > 0,
      'slash executed',
      delayInEpochs * aztecEpochDuration * aztecSlotDuration * 2,
    );

    await sleep(1000); // Wait a bit to ensure no more slashes are recorded
    expect(unique(slashed.map(addr => addr.toString()))).toEqual([offlineValidator.toString()]);
  });
});
