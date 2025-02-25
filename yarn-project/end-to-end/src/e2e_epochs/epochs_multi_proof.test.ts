import { type Logger, retryUntil, sleep } from '@aztec/aztec.js';
// eslint-disable-next-line no-restricted-imports
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/circuits.js';
import { RollupContract } from '@aztec/ethereum/contracts';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';

import { type EndToEndContext } from '../fixtures/utils.js';
import { EPOCH_DURATION_IN_L2_SLOTS, EpochsTestContext, L1_BLOCK_TIME_IN_S } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_multi_proof', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ context, rollup, constants, logger } = test);
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

    // Wait until the start of epoch one and collect info on epoch zero
    await test.waitUntilEpochStarts(1);
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const [_firstEpochStartSlot, firstEpochEndSlot] = getSlotRangeForEpoch(0n, constants);
    const firstEpochBlocks = await context.aztecNode
      .getBlocks(1, EPOCH_DURATION_IN_L2_SLOTS)
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
