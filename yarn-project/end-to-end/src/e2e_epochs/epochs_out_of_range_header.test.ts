import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';
import { encodeAbiParameters, hexToBigInt, keccak256 } from 'viem';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// A-1254 defense-in-depth regression. Fix (2) (L1 range checks, PR #24199) prevents a malicious proposer from
// ever landing an out-of-range archive root on a patched chain, so we cannot land one via a normal `propose`.
// To keep exercising the archiver-side Fix (1) defenses on a value that bypasses the contract (e.g. a pre-upgrade
// chain or a future-added field), this test uses an anvil `setStorageAt` cheat code to overwrite a checkpoint's
// archive root in the rollup's L1 storage with a value above the BN254 field modulus.
//
// Before Fix (1), the archiver eagerly converted the archive root read from L1 (in `status()` / `archiveAt()` /
// the CheckpointProposed event) into an `Fr`, which throws for an out-of-range value; the throw was uncaught and
// the node's L1 sync point stalled permanently. After Fix (1) those reads carry raw `Buffer32` bytes, the
// corrupted checkpoint is skipped on an archive-root mismatch, and the node keeps syncing.
describe('e2e_epochs/epochs_out_of_range_header', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;

  let test: EpochsTestContext;
  let observerNode: AztecNodeService;
  let observerArchiver: Archiver;

  beforeEach(async () => {
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

    // Honest observer node: a plain archiver-only node syncing L1, no validator.
    observerNode = await test.createNonValidatorNode();
    observerArchiver = observerNode.getBlockSource() as Archiver;

    logger.warn(`Test setup completed.`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  /** Computes the L1 storage slot of `rollupStore.archives[checkpointNumber]`. Mirrors makeArchiveOverride. */
  function archivesStorageSlot(checkpointNumber: CheckpointNumber): bigint {
    const archivesMappingBase = hexToBigInt(RollupContract.stfStorageSlot) + 1n;
    return hexToBigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          [BigInt(checkpointNumber), archivesMappingBase],
        ),
      ),
    );
  }

  it('honest archiver survives an out-of-range archive root injected into L1 storage and keeps syncing', async () => {
    const OUT_OF_RANGE = 2n ** 256n - 1n;

    // 1. Let the chain advance a couple of checkpoints and let the observer catch up.
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

    const syncedBeforeInjection = await observerNode.getBlockNumber();
    logger.warn(`Phase 1 complete: observer synced up to L2 block ${syncedBeforeInjection}`);

    // 2. Overwrite the next checkpoint's archive root in L1 storage with an out-of-range value, so the observer
    // reads a value >= P from `status()` / `archiveAt()` while syncing it. On a real chain Fix (2) makes this
    // unreachable; we force it here to prove Fix (1) survives a bad value that bypasses the contract.
    const injectAt = CheckpointNumber((await test.rollup.getCheckpointNumber()) + 1);
    const slot = archivesStorageSlot(injectAt);
    logger.warn(`Phase 2: corrupting archives[${injectAt}] to an out-of-range value via setStorageAt`, {
      slot: `0x${slot.toString(16)}`,
    });
    await context.cheatCodes.eth.store(EthAddress.fromString(test.rollup.address), slot, OUT_OF_RANGE);

    // The archiver wrapper must read the corrupted value as raw bytes without throwing (pre-fix this threw).
    const corruptedArchive = await rollupContract.archiveAt(injectAt);
    expect(corruptedArchive.toString()).toEqual(`0x${OUT_OF_RANGE.toString(16)}`);
    const status = await rollupContract.status(injectAt);
    expect(status).toBeDefined();

    // 3. The honest observer must keep syncing and not brick: its L1 sync point keeps advancing and it keeps
    // checkpointing the good checkpoints the chain continues to produce.
    const recoveryTarget = CheckpointNumber(Number(injectAt) + 2);
    logger.warn(`Phase 3: confirming the observer keeps syncing past the corruption (to checkpoint ${recoveryTarget})`);
    await test.monitor.waitUntilCheckpoint(recoveryTarget);

    await retryUntil(
      async () => {
        const syncedL1 = observerArchiver.getL1BlockNumber() ?? 0n;
        const checkpointed = (await observerNode.getChainTips()).checkpointed.checkpoint.number;
        logger.info(`Phase 3 observer state`, {
          syncedL1: syncedL1.toString(),
          observerCheckpointNumber: checkpointed,
          l1Head: test.monitor.l1BlockNumber,
        });
        // Fix(1) success: the observer's L1 sync point advanced past where the corrupted checkpoint was injected.
        return syncedL1 > 0n && (await observerNode.getBlockNumber()) > syncedBeforeInjection;
      },
      'observer keeps syncing past the out-of-range archive root',
      test.L2_SLOT_DURATION_IN_S * 16,
      0.5,
    );

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
