import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

describe('e2e_epochs/epochs_empty_blocks_proof', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ context, rollup, logger, monitor, L1_BLOCK_TIME_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('submits proof even if there are no txs to build a block', async () => {
    context.sequencer?.updateConfig({ minTxsPerBlock: 1 });
    await test.waitUntilEpochStarts(1);

    // Sleep to make sure any pending checkpoints are published
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const checkpointNumberAtEndOfEpoch0 = await rollup.getCheckpointNumber();
    logger.info(`Starting epoch 1 after checkpoint ${checkpointNumberAtEndOfEpoch0}`);

    await test.waitUntilProvenCheckpointNumber(checkpointNumberAtEndOfEpoch0, 240);
    expect(monitor.checkpointNumber).toEqual(checkpointNumberAtEndOfEpoch0);
    logger.info(`Test succeeded`);
  });
});
