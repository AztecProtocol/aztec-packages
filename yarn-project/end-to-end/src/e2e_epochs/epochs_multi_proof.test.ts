import { type Logger, retryUntil, sleep } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum/contracts';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_multi_proof', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;

  let L1_BLOCK_TIME_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ context, rollup, constants, logger, L1_BLOCK_TIME_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('submits proofs from multiple prover-nodes', async () => {
    await test.createProverNode();
    await test.createProverNode();
    const proverIds = test.proverNodes.map(prover => EthAddress.fromField(prover.getProverId()));
    logger.info(`Prover nodes running with ids ${proverIds.map(id => id.toString()).join(', ')}`);

    // Add a delay to prover nodes so not all txs land on the same place
    test.proverNodes.forEach((prover, index) => {
      const proverManager = prover.getProver();
      const origCreateEpochProver = proverManager.createEpochProver.bind(proverManager);
      proverManager.createEpochProver = () => {
        const epochProver = origCreateEpochProver();
        const origFinaliseEpoch = epochProver.finaliseEpoch.bind(epochProver);
        epochProver.finaliseEpoch = async () => {
          const result = await origFinaliseEpoch();
          const sleepTime = index * 1000 * test.constants.ethereumSlotDuration;
          logger.warn(`Delaying finaliseEpoch for prover node ${index} by ${sleepTime}ms`);
          await sleep(sleepTime);
          return result;
        };
        return epochProver;
      };
    });

    // Wait until the start of epoch one and collect info on epoch zero
    await test.waitUntilEpochStarts(1);
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const [_firstEpochStartSlot, firstEpochEndSlot] = getSlotRangeForEpoch(0n, constants);
    const firstEpochBlocks = await context.aztecNode
      .getBlocks(1, test.epochDuration)
      .then(blocks => blocks.filter(block => block.header.getSlot() <= firstEpochEndSlot));
    const firstEpochLength = firstEpochBlocks.length;
    const firstEpochLastBlockNum = firstEpochBlocks.at(-1)!.number;
    logger.info(`Starting epoch 1 with length ${firstEpochLength} after L2 block ${firstEpochLastBlockNum}`);

    // Wait until all three provers have submitted proofs
    await retryUntil(
      async () => {
        const haveSubmitted = await Promise.all(
          proverIds.map(proverId => rollup.getHasSubmittedProof(0, firstEpochLength, proverId)),
        );
        logger.info(`Proof submissions: ${haveSubmitted.join(', ')}`);
        return haveSubmitted.every(submitted => submitted);
      },
      'Provers have submitted proofs',
      120,
    );

    const provenBlockNumber = await context.aztecNode.getProvenBlockNumber();
    expect(provenBlockNumber).toEqual(firstEpochLastBlockNum);

    logger.info(`Test succeeded`);
  });
});
