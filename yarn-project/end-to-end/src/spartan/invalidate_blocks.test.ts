import { RollupContract, type ViemPublicClient } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { timeoutPromise } from '@aztec/foundation/timer';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { AztecNode, AztecNodeAdminConfig } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import {
  getL1DeploymentAddresses,
  getNodeClient,
  getPublicViemClient,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';

const config = setupEnvironment(process.env);

const ETHEREUM_SLOT_DURATION = 12;

// This test causes a proposer to push a block without valid attestations, then waits for
// the following proposer to invalidate it and propose a new block instead. The test also
// disables slashing to avoid the invalid block proposer getting slashed.
describe('invalidate blocks test', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const logger = createLogger(`e2e:invalidate-blocks`);

  const forwardProcesses: ChildProcess[] = [];

  let client: ViemPublicClient;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let monitor: ChainMonitor;
  let node: AztecNode;
  let origMinTxsPerBlock: number | undefined;
  let origSlashProposeInvalidAttestationsPenalty: bigint | undefined;
  let origSlashAttestDescendantOfInvalidPenalty: bigint | undefined;

  beforeAll(async () => {
    const deployAddresses = await getL1DeploymentAddresses(config);
    ({ client } = await getPublicViemClient(config, forwardProcesses));
    rollup = new RollupContract(client, deployAddresses.rollupAddress);
    monitor = new ChainMonitor(rollup, undefined, logger.createChild('chain-monitor'), 500).start();
    const c = await rollup.getRollupConstants();
    constants = { ...c, ethereumSlotDuration: ETHEREUM_SLOT_DURATION } as L1RollupConstants;

    const { node: nodeClient, process } = await getNodeClient(config);
    node = nodeClient;
    forwardProcesses.push(process);
  });

  afterAll(async () => {
    const restoreConfig: Partial<AztecNodeAdminConfig> = {
      skipCollectingAttestations: false,
      minTxsPerBlock: origMinTxsPerBlock,
      slashProposeInvalidAttestationsPenalty: origSlashProposeInvalidAttestationsPenalty,
      slashAttestDescendantOfInvalidPenalty: origSlashAttestDescendantOfInvalidPenalty,
    };
    await updateSequencersConfig(config, restoreConfig);
    monitor.removeAllListeners();
    await monitor.stop();
    forwardProcesses.forEach(p => p.kill());
  });

  /** Waits for a BlockInvalidated event */
  const waitForBlockInvalidated = (timeoutSeconds: number) => {
    logger.warn(`Waiting until a block is invalidated`);
    const promise = promiseWithResolvers<{ blockNumber: bigint }>();
    const unsubscribe = rollup.listenToBlockInvalidated(data => {
      logger.warn(`Block ${data.blockNumber} has been invalidated`, data);
      unsubscribe();
      promise.resolve(data);
    });

    return Promise.race([promise.promise, timeoutPromise(timeoutSeconds * 1000)]);
  };

  it('posts an invalid block and next proposer invalidates it', async () => {
    const configs = await getSequencersConfig(config);
    configs.forEach(c => logger.info(`Loaded initial sequencer config`, c));
    const first = configs?.[0];
    origMinTxsPerBlock = first?.minTxsPerBlock ?? origMinTxsPerBlock;
    origSlashProposeInvalidAttestationsPenalty = first?.slashProposeInvalidAttestationsPenalty;
    origSlashAttestDescendantOfInvalidPenalty = first?.slashAttestDescendantOfInvalidPenalty;

    const initialBlockNumber = (await monitor.run()).l2BlockNumber;

    // Update configs so next block is posted with invalid attestations, and we avoid slashing so we do not kick
    // people of the validator set with this test.
    await updateSequencersConfig(config, {
      skipCollectingAttestations: true,
      slashProposeInvalidAttestationsPenalty: 0n,
      slashAttestDescendantOfInvalidPenalty: 0n,
      minTxsPerBlock: 0,
    });

    // Wait for the invalidation to happen (should not take more than 2 slots, but we wait for 4 just in case)
    await waitForBlockInvalidated(constants.slotDuration * 4);

    // Restore sequencer configs to normal
    await updateSequencersConfig(config, { skipCollectingAttestations: false });

    // Wait until a few more blocks have been mined to ensure the chain can progress after the invalid block
    // Note that we should expect more invalidations depending on when the patched config hits
    const targetBlockNumber = initialBlockNumber + 4;
    logger.warn(`Waiting until block ${targetBlockNumber} has been mined to ensure the chain can progress`);
    await Promise.race([
      monitor.waitUntilL2Block(targetBlockNumber),
      timeoutPromise(constants.slotDuration * 8 * 1000, `Timeout waiting for ${targetBlockNumber} L2 block`),
    ]);

    // Ensure the nodes also sync to this block
    await retryUntil(async () => {
      const block = await node.getBlockNumber();
      logger.info(`L2 block number in node is ${block}`);
      return block >= targetBlockNumber;
    }, `node to sync to block ${targetBlockNumber}`);
  });
});
