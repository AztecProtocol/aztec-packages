import { type Logger, getTimestampRangeForEpoch, retryUntil, sleep } from '@aztec/aztec.js';
import { ChainMonitor } from '@aztec/aztec.js/ethereum';
// eslint-disable-next-line no-restricted-imports
import { type L1RollupConstants, type L2BlockNumber, MerkleTreeId } from '@aztec/circuit-types';
import { RollupContract } from '@aztec/ethereum/contracts';
import { waitUntilL1Timestamp } from '@aztec/ethereum/test';

import { jest } from '@jest/globals';
import { type PublicClient } from 'viem';

import { type EndToEndContext, setup } from './fixtures/utils.js';

jest.setTimeout(1000 * 60 * 10);

// Tests building of epochs using fast block times and short epochs.
// Spawns an aztec node and a prover node with fake proofs.
// Sequencer is allowed to build empty blocks.
describe('e2e_ignition', () => {
  let context: EndToEndContext;
  let l1Client: PublicClient;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;
  let monitor: ChainMonitor;

  const EPOCH_DURATION_IN_L2_SLOTS = 4;
  const L2_SLOT_DURATION_IN_L1_SLOTS = 2;
  const L1_BLOCK_TIME_IN_S = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 2;
  const WORLD_STATE_BLOCK_HISTORY = 2;
  const WORLD_STATE_BLOCK_CHECK_INTERVAL = 50;
  const ARCHIVER_POLL_INTERVAL = 50;

  beforeEach(async () => {
    // Set up system without any account nor protocol contracts
    // and with faster block times and shorter epochs.
    context = await setup(0, {
      assumeProvenThrough: undefined,
      checkIntervalMs: 50,
      archiverPollingIntervalMS: ARCHIVER_POLL_INTERVAL,
      worldStateBlockCheckIntervalMS: WORLD_STATE_BLOCK_CHECK_INTERVAL,
      skipProtocolContracts: true,
      salt: 1,
      aztecEpochDuration: EPOCH_DURATION_IN_L2_SLOTS,
      aztecSlotDuration: L1_BLOCK_TIME_IN_S * L2_SLOT_DURATION_IN_L1_SLOTS,
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
      aztecProofSubmissionWindow: EPOCH_DURATION_IN_L2_SLOTS * 2 - 1,
      minTxsPerBlock: 0,
      realProofs: false,
      startProverNode: true,
      // This must be enough so that the tx from the prover is delayed properly,
      // but not so much to hang the sequencer and timeout the teardown
      txPropagationMaxQueryAttempts: 12,
      worldStateBlockHistory: WORLD_STATE_BLOCK_HISTORY,
    });

    logger = context.logger;
    l1Client = context.deployL1ContractsValues.publicClient;
    rollup = RollupContract.getFromConfig(context.config);

    // Loop that tracks L1 and L2 block numbers and logs whenever there's a new one.
    monitor = new ChainMonitor(rollup, logger);
    monitor.start();

    // Constants used for time calculation
    constants = {
      epochDuration: EPOCH_DURATION_IN_L2_SLOTS,
      slotDuration: L1_BLOCK_TIME_IN_S * L2_SLOT_DURATION_IN_L1_SLOTS,
      l1StartBlock: await rollup.getL1StartBlock(),
      l1GenesisTime: await rollup.getL1GenesisTime(),
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
    };

    logger.info(`L2 genesis at L1 block ${constants.l1StartBlock} (timestamp ${constants.l1GenesisTime})`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    monitor.stop();
    await context.proverNode?.stop();
    await context.teardown();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    monitor.stop();
    await context.proverNode?.stop();
    await context.teardown();
  });

  /** Waits until the epoch begins (ie until the immediately previous L1 block is mined). */
  const waitUntilEpochStarts = async (epoch: number) => {
    const [start] = getTimestampRangeForEpoch(BigInt(epoch), constants);
    logger.info(`Waiting until L1 timestamp ${start} is reached as the start of epoch ${epoch}`);
    await waitUntilL1Timestamp(l1Client, start - BigInt(L1_BLOCK_TIME_IN_S));
    return start;
  };

  /** Waits until the given L2 block number is mined. */
  const waitUntilL2BlockNumber = async (target: number) => {
    await retryUntil(() => Promise.resolve(target === monitor.l2BlockNumber), `Wait until L2 block ${target}`, 60, 0.1);
  };

  /** Waits until the given L2 block number is marked as proven. */
  const waitUntilProvenL2BlockNumber = async (t: number, timeout = 60) => {
    await retryUntil(
      () => Promise.resolve(t === monitor.l2ProvenBlockNumber),
      `Wait proven L2 block ${t}`,
      timeout,
      0.1,
    );
  };

  const waitForNodeToSync = async (blockNumber: number, type: 'finalised' | 'historic') => {
    const waitTime = ARCHIVER_POLL_INTERVAL + WORLD_STATE_BLOCK_CHECK_INTERVAL;
    let synched = false;
    while (!synched) {
      await sleep(waitTime);
      const syncState = await context.aztecNode.getWorldStateSyncStatus();
      if (type === 'finalised') {
        synched = syncState.finalisedBlockNumber >= blockNumber;
      } else {
        synched = syncState.oldestHistoricBlockNumber >= blockNumber;
      }
    }
  };

  const verifyHistoricBlock = async (blockNumber: L2BlockNumber, expectedSuccess: boolean) => {
    const result = await context.aztecNode
      .findBlockNumbersForIndexes(blockNumber, MerkleTreeId.NULLIFIER_TREE, [0n])
      .then(_ => true)
      .catch(_ => false);
    expect(result).toBe(expectedSuccess);
  };

  it('successfully proves all epochs', async () => {
    const targetProvenEpochs = 8;
    const targetProvenBlockNumber = targetProvenEpochs * EPOCH_DURATION_IN_L2_SLOTS;

    let provenBlockNumber = 0;
    let epochNumber = 0;
    while (provenBlockNumber < targetProvenBlockNumber) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await waitUntilEpochStarts(epochNumber + 1);
      const epochTargetBlockNumber = Number(await rollup.getBlockNumber());
      logger.info(`Epoch ${epochNumber} ended with PENDING block number ${epochTargetBlockNumber}`);
      await waitUntilL2BlockNumber(epochTargetBlockNumber);
      provenBlockNumber = epochTargetBlockNumber;
      logger.info(
        `Reached PENDING L2 block ${epochTargetBlockNumber}, proving should now start, waiting for PROVEN block to reach ${provenBlockNumber}`,
      );
      await waitUntilProvenL2BlockNumber(provenBlockNumber, 120);
      expect(Number(await rollup.getProvenBlockNumber())).toBe(provenBlockNumber);
      logger.info(`Reached PROVEN block number ${provenBlockNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs
      await waitForNodeToSync(provenBlockNumber, 'finalised');
      await verifyHistoricBlock(provenBlockNumber, true);
      const expectedOldestHistoricBlock = provenBlockNumber - WORLD_STATE_BLOCK_HISTORY + 1;
      const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
      await waitForNodeToSync(expectedOldestHistoricBlock, 'historic');
      await verifyHistoricBlock(Math.max(expectedOldestHistoricBlock, 1), true);
      if (expectedBlockRemoved > 0) {
        await verifyHistoricBlock(expectedBlockRemoved, false);
      }
    }
    logger.info('Test Succeeded');
  });
});
