import type { AztecNodeService } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { OffenseType } from '@aztec/slasher';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { awaitCommitteeExists, awaitCommitteeKicked, awaitOffenseDetected, submitTransactions } from './shared.js';

jest.setTimeout(1500000);

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;
const COMMITTEE_SIZE = NUM_VALIDATORS;

// This test needs longer slot window to ensure that the client has enough time to submit their txs,
// and have the nodes get recreated, prior to the reorg.
const AZTEC_SLOT_DURATION = process.env.AZTEC_SLOT_DURATION ? parseInt(process.env.AZTEC_SLOT_DURATION) : 32;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'data-withholding-slash-'));

/**
 * Demonstrate that slashing occurs when the chain is pruned, and we are unable to collect the transactions data post-hoc.
 *
 * The setup of the test is as follows:
 * 1. Create the "initial" node, and 4 other nodes
 * 2. Await the 4 other nodes to form the committee
 * 3. Send a tx to the initial node
 * 4. Stop all the nodes and wipe their data directories
 * 5. Re-create the nodes
 * 6. Expect that a slash payload is deployed with the data withholding offense
 *
 * The reason is that with the data directories wiped, they have no way to get the original transaction data
 * when the chain is pruned. So they slash themselves.
 *
 */
describe('e2e_p2p_data_withholding_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingUnit = BigInt(1e18);
  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const aztecEpochDuration = 2;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_data_withholding_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration,
        ethereumSlotDuration: 4,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecProofSubmissionEpochs: 0, // effectively forces instant reorgs
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
        slashSelfAllowed: true,
        minTxsPerBlock: 0,
        enableProposerPipelining: true,
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const debugRollup = async () => {
    await t.ctx.cheatCodes.rollup.debugRollup();
  };

  it('slashes the committee when data is unavailable for the pruned epoch', async () => {
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const { rollup, slashingProposer } = await t.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);

    // Slashing amount should be enough to kick validators out
    const slashingAmount = slashingUnit * 3n;
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - slashingAmount).toBeLessThan(biggestEjection);

    t.ctx.aztecNodeConfig.slashDataWithholdingPenalty = slashingAmount;
    t.ctx.aztecNodeConfig.slashPrunePenalty = slashingAmount;
    t.ctx.aztecNodeConfig.minTxsPerBlock = 1;

    t.logger.warn('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // Wait for P2P mesh to be fully formed before proceeding
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

    await debugRollup();
    const committee = await awaitCommitteeExists({ rollup, logger: t.logger });
    await debugRollup();

    // Jump forward more time to ensure we're at the beginning of an epoch.
    // This should reduce flake, since we need to have the transaction included
    // and the nodes recreated, prior to the reorg.
    // Considering the slot duration is 32 seconds,
    // Considering the epoch duration is 2 slots,
    // we have ~64 seconds to do this.
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(8));
    await t.sendDummyTx();
    await debugRollup();

    // Send L2 txs through a validator node to ensure blocks are built (needed for pruning to trigger).
    t.logger.warn('Sending L2 txs through a validator node');
    const txHashes = await submitTransactions(t.logger, nodes[0], 1, t.fundedAccount);
    await Promise.all(txHashes.map(txHash => waitForTx(nodes[0], txHash, { timeout: WAIT_FOR_TX_TIMEOUT })));
    t.logger.warn('L2 txs mined');

    t.logger.warn('Stopping nodes');
    // removeInitialNode sends a dummy L1 tx and awaits its receipt to sync the
    // dateProvider, so it must run while L1 mining is still active.
    await t.removeInitialNode();

    // Pause L1 block production while we tear down and recreate validators. With
    // `aztecProofSubmissionEpochs=0`, epoch 8 becomes prunable as soon as epoch 9 begins
    // (~32s after slot 17). The stop/wipe/recreate cycle takes longer than that, so L1
    // would otherwise race past the prune deadline before the recreated nodes come up.
    // When that happens, the recreated archivers detect the prune during their initial
    // sync (`handleEpochPrune` emits `L2PruneUnproven`), but the `EpochPruneWatcher`
    // listener is only attached after `archiver.waitForInitialSync()` resolves
    // (see `aztec-node/server.ts`), so the event is dropped and `DATA_WITHHOLDING` is
    // never emitted. By freezing L1 here, the recreated archivers ingest checkpoint 1
    // cleanly during initial sync, the watcher starts and attaches its listener, and
    // then we resume L1 below so the prune fires while the listener is live.
    const ethCheatCodes = t.ctx.cheatCodes.eth;
    await ethCheatCodes.setAutomine(false);
    await ethCheatCodes.setIntervalMining(0);

    // Fail fast if we paused too late — i.e. if L1 already crossed into epoch 9 before
    // we got here. In that case the recreated nodes would still see the prune during
    // initial sync and the test would flake exactly the same way.
    const epochAtPause = await rollup.getCurrentEpoch();
    expect(Number(epochAtPause)).toBeLessThan(9);

    // Now stop the validator nodes. With L1 paused, any in-flight L1 submissions from
    // the validator sequencers would hang `sequencer.stop()` (it awaits pending L1
    // submissions). Since `minTxsPerBlock=1` and no txs are queued for slot 18+, the
    // sequencers don't submit further L1 transactions after the slot-17 checkpoint
    // (already published before `waitForTx` returned), so this is safe.
    await t.stopNodes(nodes);
    // And remove the data directories (which forms the crux of the "attack")
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }

    // Re-create the nodes.
    // ASSUMING they sync in the middle of the epoch, they will "see" the reorg, and try to slash.
    // Reset minTxsPerBlock to 0 so re-created validators build empty checkpoints. Under proposer
    // pipelining, the vote-offenses signature is bound to the target slot and the multicall is only
    // delayed to the target slot start when a checkpoint is being proposed; without a proposal,
    // votes would mine in the current wall-clock slot, causing the EIP-712 signature verification to fail.
    t.ctx.aztecNodeConfig.minTxsPerBlock = 0;
    t.logger.warn('Re-creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
    );

    // Wait for P2P mesh to be fully formed before proceeding
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

    // Resume L1 block production. Warp L1 forward to current wall-clock time so the
    // epoch-8 deadline is crossed immediately on the next L1 block, then re-enable
    // interval mining. By now each recreated archiver has block 1 stored locally and
    // its `EpochPruneWatcher` listener is attached, so the next sync iteration emits
    // `L2PruneUnproven` for epoch 8 to a live listener → `DATA_WITHHOLDING`.
    const resumeTimestamp = Math.floor(t.ctx.dateProvider.now() / 1000);
    await ethCheatCodes.setNextBlockTimestamp(resumeTimestamp);
    await ethCheatCodes.mine();
    await ethCheatCodes.setIntervalMining(t.ctx.aztecNodeConfig.ethereumSlotDuration);

    const offenses = await awaitOffenseDetected({
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      logger: t.logger,
      nodeAdmin: nodes[0],
      slashingRoundSize,
      waitUntilOffenseCount: COMMITTEE_SIZE,
    });

    // Check offenses are correct
    expect(offenses.map(o => o.validator.toString()).sort()).toEqual(committee.map(a => a.toString()).sort());
    expect(offenses.map(o => o.offenseType)).toEqual(times(COMMITTEE_SIZE, () => OffenseType.DATA_WITHHOLDING));
    const offenseEpoch = Number(offenses[0].epochOrSlot);

    await awaitCommitteeKicked({
      rollup,
      cheatCodes: t.ctx.cheatCodes.rollup,
      committee,
      slashingProposer,
      slashingRoundSize,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      logger: t.logger,
      offenseEpoch,
      aztecEpochDuration,
    });
  });
});
