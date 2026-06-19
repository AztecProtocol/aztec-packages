import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { SequencerClient } from '@aztec/sequencer-client';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Reproduces A-1254: a malicious proposer posts a checkpoint whose header carries a uint256 field value above the
// BN254 scalar field modulus. Honest archivers cannot convert that field back into an Fr while decoding the propose
// calldata, so their L1 sync throws and never advances past the L1 block where the malicious checkpoint landed,
// permanently bricking the node.
//
// The rollup is deployed with a target committee size of 0 (the default epochs setup with no validators), so
// ValidatorSelectionLib.verifyProposer skips signature validation on L1. That lets the corrupted header land on L1
// without forging the proposer signature, while still exercising the exact archiver decode path the issue is about.
describe('e2e_epochs/epochs_out_of_range_header', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;

  let test: EpochsTestContext;
  let maliciousSequencer: SequencerClient;
  let observerNode: AztecNodeService;
  let observerArchiver: Archiver;

  beforeEach(async () => {
    // No validators -> target committee size 0 -> single context sequencer proposes every slot and L1 skips
    // signature checks. minTxsPerBlock 0 (default) so empty checkpoints build without any txs.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      aztecProofSubmissionEpochs: 1024,
      aztecSlotDurationInL1Slots: 3,
      ethereumSlotDuration: 12,
      blockDurationMs: 6000,
      startProverNode: false,
      minTxsPerBlock: 0,
    });

    ({ context, logger, l1Client } = test);
    rollupContract = new RollupContract(l1Client, test.rollup.address);
    maliciousSequencer = context.sequencer!;

    // Honest observer node: a plain archiver-only node syncing L1, no validator.
    observerNode = await test.createNonValidatorNode();
    observerArchiver = observerNode.getBlockSource() as Archiver;

    logger.warn(`Test setup completed.`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('honest archiver stalls when a malicious proposer posts an out-of-range checkpoint header', async () => {
    // 1. Let the chain advance a couple of checkpoints normally and let the observer catch up to them.
    const goodCheckpointTarget = CheckpointNumber(2);
    logger.warn(`Phase 1: waiting for ${goodCheckpointTarget} good checkpoints to be mined`);
    await test.monitor.waitUntilCheckpoint(goodCheckpointTarget);

    logger.warn(`Phase 1: waiting for observer node to sync the good checkpoints`);
    await retryUntil(
      async () => {
        const tips = await observerNode.getChainTips();
        logger.info(`Observer checkpointed checkpoint=${tips.checkpointed.checkpoint.number}`);
        return tips.checkpointed.checkpoint.number >= goodCheckpointTarget;
      },
      'observer syncs good checkpoints',
      test.L2_SLOT_DURATION_IN_S * 8,
      0.5,
    );

    const preAttackBlockNumber = await observerNode.getBlockNumber();
    const preAttackL1BlockNumber = observerArchiver.getL1BlockNumber();
    const preAttackCheckpointNumber = await test.rollup.getCheckpointNumber();
    logger.warn(`Phase 1 complete: observer synced before attack`, {
      preAttackBlockNumber,
      preAttackL1BlockNumber: preAttackL1BlockNumber?.toString(),
      preAttackCheckpointNumber,
    });

    // 2. Enable the malicious injection on the proposer. Under proposer pipelining the checkpoint that is built
    // in the next slot may already have snapshotted the previous (good) config, so the first one or two checkpoints
    // after this call can still be valid; the injection takes effect once a freshly-built checkpoint is published.
    logger.warn(`Phase 2: enabling injectOutOfRangeCheckpointHeader on the proposer`);
    maliciousSequencer.updateConfig({ injectOutOfRangeCheckpointHeader: true, skipCollectingAttestations: true });

    // 3. Wait until the honest observer's archiver bricks: its synced L1 block stops advancing while the L1 chain
    // (and the rollup's on-chain checkpoint number) keep climbing. The brick is the archiver throwing on the
    // out-of-range header during decode and never advancing its L1 sync point past the malicious checkpoint.
    logger.warn(`Phase 3: waiting for the honest observer's archiver to stall`);
    let stalledSyncedL1 = preAttackL1BlockNumber ?? 0n;
    let stalledCheckpointNumber = Number(preAttackCheckpointNumber);
    await retryUntil(
      async () => {
        const syncedL1 = observerArchiver.getL1BlockNumber() ?? 0n;
        const onChainCheckpointNumber = await test.rollup.getCheckpointNumber();
        stalledSyncedL1 = syncedL1;
        stalledCheckpointNumber = Number((await observerNode.getChainTips()).checkpointed.checkpoint.number);
        logger.info(`Phase 3 observer state`, {
          syncedL1: syncedL1.toString(),
          observerCheckpointNumber: stalledCheckpointNumber,
          onChainCheckpointNumber,
          l1Head: test.monitor.l1BlockNumber,
        });
        // Bricked once the rollup has at least one checkpoint the observer never managed to checkpoint. The malicious
        // checkpoint also bricks the proposer's own archiver, so on-chain progress halts exactly one checkpoint ahead
        // of the observer; we therefore only require a single-checkpoint gap rather than several.
        return onChainCheckpointNumber > stalledCheckpointNumber;
      },
      'observer archiver falls behind on-chain checkpoints',
      test.L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );

    // The malicious checkpoint is the first one the observer never synced: one past its stalled checkpoint number.
    const maliciousCheckpointNumber = CheckpointNumber(stalledCheckpointNumber + 1);
    const proposedEvents = await rollupContract.getCheckpointProposedEvents(1n, await l1Client.getBlockNumber());
    const maliciousEvent = proposedEvents.find(e => e.args.checkpointNumber === maliciousCheckpointNumber);
    // Confirm the malicious checkpoint actually mined on L1 (the brick comes from decode, not a reverted propose).
    expect(maliciousEvent).toBeDefined();
    const maliciousL1BlockNumber = Number(maliciousEvent!.l1BlockNumber);
    logger.warn(`Phase 3: identified malicious checkpoint mined on L1`, {
      maliciousCheckpointNumber,
      maliciousL1BlockNumber,
      l1TransactionHash: maliciousEvent!.l1TransactionHash,
      observerStalledAtCheckpoint: stalledCheckpointNumber,
      observerStalledAtSyncedL1: stalledSyncedL1.toString(),
    });

    // 4. Let the L1 chain advance well past the malicious checkpoint, then confirm the honest observer stays stuck:
    // its synced L1 block does not advance past the malicious checkpoint's L1 block and it never checkpoints it.
    const l1Target = BigInt(maliciousL1BlockNumber) + BigInt(8);
    logger.warn(
      `Phase 4: waiting for L1 to advance to block ${l1Target} (past malicious block ${maliciousL1BlockNumber})`,
    );
    await test.monitor.waitUntilL1Block(l1Target);

    const observeMs = test.L2_SLOT_DURATION_IN_S * 6 * 1000;
    logger.warn(`Phase 4: observing honest archiver for ${observeMs}ms to confirm it cannot advance past the brick`);
    const deadline = Date.now() + observeMs;
    let maxObservedSyncedL1 = 0n;
    let maxObservedCheckpointNumber = 0;
    while (Date.now() < deadline) {
      const syncedL1 = observerArchiver.getL1BlockNumber() ?? 0n;
      const checkpointNumber = Number((await observerNode.getChainTips()).checkpointed.checkpoint.number);
      if (syncedL1 > maxObservedSyncedL1) {
        maxObservedSyncedL1 = syncedL1;
      }
      maxObservedCheckpointNumber = Math.max(maxObservedCheckpointNumber, checkpointNumber);
      logger.info(`Observer archiver state during brick window`, {
        syncedL1: syncedL1.toString(),
        checkpointNumber,
        maliciousL1BlockNumber,
        maliciousCheckpointNumber,
        l1Head: test.monitor.l1BlockNumber,
      });
      await sleep(1000);
    }

    logger.warn(`Phase 4 results`, {
      maxObservedSyncedL1: maxObservedSyncedL1.toString(),
      maxObservedCheckpointNumber,
      maliciousL1BlockNumber,
      maliciousCheckpointNumber,
      currentL1BlockNumber: test.monitor.l1BlockNumber,
    });

    // The L1 chain has advanced well past the malicious checkpoint's L1 block, but the honest archiver is stuck.
    expect(test.monitor.l1BlockNumber).toBeGreaterThan(maliciousL1BlockNumber);
    // The honest archiver's L1 sync point never reached the malicious checkpoint's L1 block: it is bricked.
    expect(Number(maxObservedSyncedL1)).toBeLessThan(maliciousL1BlockNumber);
    // And it never checkpointed the malicious checkpoint either.
    expect(maxObservedCheckpointNumber).toBeLessThan(maliciousCheckpointNumber);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
