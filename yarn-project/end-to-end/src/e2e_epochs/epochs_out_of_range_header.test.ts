import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { encodeAbiParameters, hexToBigInt, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

const VALIDATOR_COUNT = 4;

/**
 * E2E recovery test for the archiver hardening against out-of-range checkpoint-header/archive fields.
 *
 * A misbehaving proposer lands the first checkpoint with only its own signature (insufficient
 * attestations). Its stored archive root is then corrupted to a value above the BN254 field modulus
 * via an anvil `setStorageAt` cheat code. The honest validators and an archiver-only observer node then
 * must (a) keep reading the out-of-range pending tip via `status()` / `archiveAt()` without bricking
 * their L1 sync, (b) invalidate the under-attested checkpoint, and (c) build past it.
 *
 * Why the corruption is injected via storage rather than through `propose`: the L1 `propose` path now
 * reverts on out-of-range field elements (PR #24199, already in the base branch), so an out-of-range
 * value can no longer arrive through a normal proposal. We therefore corrupt the stored archive root
 * AFTER the checkpoint lands — its calldata/event archive carries the real in-range value, while the
 * stored slot is corrupted. `status()` / `archiveAt()` read the corrupted slot, which is exactly the
 * pre-fix brick path. This models a pre-upgrade chain or a future-added field, the only realistic
 * vector once the L1 range checks exist.
 *
 * Before the archiver fix, the archive root read from L1 (via `status()` / `archiveAt()`) was eagerly
 * converted to an `Fr`, which throws for an out-of-range value; the throw was uncaught and the node's
 * L1 sync point stalled permanently, so it could never compute that the pending tip was under-attested
 * and never invalidate it. After the fix those reads carry raw `Buffer32` bytes, the node keeps syncing,
 * sees the insufficient attestations, and invalidates — letting honest proposers build past the bad tip.
 *
 * The honest validator nodes are created up front against the clean chain (so their tx-pool hydration
 * reads an in-range pending tip) but their sequencers stay stopped: only the misbehaving proposer's
 * sequencer runs first, lands and corrupts checkpoint 1, and is then stopped before the honest sequencers
 * start. The honest validators recover via the L1-sync invalidation path, which reads the corrupted tip
 * only through the hardened `status()`/`archiveAt()` reads.
 */
describe('e2e_epochs/epochs_out_of_range_header', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let observerNode: AztecNodeService;
  let observerArchiver: Archiver;

  beforeEach(async () => {
    // Four validators so that, after one misbehaves and is stopped, the remaining three honest validators
    // still reach the >2/3 attestation quorum (3 of 4). aztecTargetCommitteeSize is derived from
    // initialValidators.length by the harness, so the committee is exactly these four.
    validators = times(VALIDATOR_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      startProverNode: false,
      skipInitialSequencer: true,
      buildCheckpointIfEmpty: true,
      minTxsPerBlock: 0,
      aztecEpochDuration: 8,
      aztecProofSubmissionEpochs: 1024,
      ethereumSlotDuration: 6,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      attestationPropagationTime: 0.5,
      inboxLag: 2,
      // Invalidate promptly as a committee member once the pending tip is seen to be under-attested,
      // so recovery does not depend on the long production defaults.
      secondsBeforeInvalidatingBlockAsCommitteeMember: 1,
    });

    ({ context, logger, l1Client } = test);
    rollupContract = new RollupContract(l1Client, test.rollup.address);

    // Create all four validator nodes up front, against the clean genesis chain, but keep their sequencers
    // stopped. Creating them now (before any checkpoint, so their tx-pool hydration reads the in-range
    // genesis pending tip) avoids an unrelated startup-time decode of the pending archive root; the
    // recovery we are testing happens through the incremental L1-sync path, not node creation.
    nodes = await Promise.all(
      validators.map((v, i) =>
        test.createValidatorNode([v.privateKey], {
          dontStartSequencer: true,
          buildCheckpointIfEmpty: true,
          minTxsPerBlock: 0,
          coinbase: EthAddress.fromNumber(i + 1),
        }),
      ),
    );

    observerNode = await test.createNonValidatorNode({ buildCheckpointIfEmpty: true, minTxsPerBlock: 0 });
    observerArchiver = observerNode.getBlockSource() as Archiver;

    logger.warn(`Test setup completed.`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
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

  /**
   * Scans forward from the current slot for the first upcoming proposal slot owned by one of our
   * validators, returning that slot and the index of the validator that proposes it. The L1 rollup only
   * exposes proposers for epochs whose randao seed is stable; looking too far ahead reverts with
   * `ValidatorSelection__EpochNotStable`, which we recover from by warping L1 forward one epoch.
   */
  async function findFirstProposalSlot(): Promise<{ slot: SlotNumber; validatorIndex: number }> {
    const addresses = validators.map(v => v.attester.toString().toLowerCase());
    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        const proposer = await test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate));
        const validatorIndex = proposer ? addresses.indexOf(proposer.toString().toLowerCase()) : -1;
        if (validatorIndex >= 0) {
          logger.warn(`First upcoming proposal slot ${candidate} owned by validator ${validatorIndex}.`, {
            slot: candidate,
            proposer: proposer!.toString(),
          });
          return { slot: SlotNumber(candidate), validatorIndex };
        }
        candidate++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await test.l1Client.getBlock({ includeTransactions: false });
        const warpBy = test.epochDuration * test.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(test.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + 4) {
          candidate = newCurrentSlot + 4;
        }
      }
    }
    throw new Error(`Could not find an upcoming proposal slot owned by one of our validators`);
  }

  it('honest validators invalidate an under-attested checkpoint with a corrupted archive root and build past it', async () => {
    const OUT_OF_RANGE = 2n ** 256n - 1n;

    // 1. Find the first upcoming proposal slot owned by one of our validators. That validator is the lone
    // misbehaving proposer of checkpoint 1; the other three are the honest validators.
    const { slot: firstSlot, validatorIndex: badIndex } = await findFirstProposalSlot();
    const badNode = nodes[badIndex];
    const honestNodes = nodes.filter((_, i) => i !== badIndex);

    // 2. Start ONLY the misbehaving validator's sequencer, with skipCollectingAttestations so it proposes
    // with just its own signature (1 of 4 → below the 3-of-4 quorum). Under proposer pipelining the
    // proposer for proposal slot S builds during wall-clock slot S-1, so warp to one L1 slot before S-1.
    badNode.getSequencer()!.updateConfig({ skipCollectingAttestations: true });

    const buildSlot = SlotNumber(firstSlot - 1);
    const buildSlotTimestamp = getTimestampForSlot(buildSlot, test.constants);
    await context.cheatCodes.eth.warp(Number(buildSlotTimestamp) - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
    });
    logger.warn(`Warped to 1 L1 slot before build slot ${buildSlot} (proposal slot ${firstSlot}).`);

    logger.warn(`Starting lone misbehaving validator ${badIndex} (skipCollectingAttestations).`);
    await badNode.getSequencer()!.start();

    // 3. Wait for the under-attested checkpoint 1 to land on L1.
    const corruptCheckpoint = CheckpointNumber(1);
    await test.waitUntilCheckpointNumber(corruptCheckpoint, test.L2_SLOT_DURATION_IN_S * 6);
    expect(await rollupContract.getCheckpointNumber()).toBeGreaterThanOrEqual(corruptCheckpoint);
    logger.warn(`Checkpoint ${corruptCheckpoint} landed on L1.`);

    // 4. Corrupt the stored archive root of checkpoint 1 to an out-of-range value. We do this AFTER it has
    // landed so `propose` (which now reverts on out-of-range fields, PR #24199) has already written the real
    // in-range value to the slot and will not overwrite it again. The checkpoint's calldata/event archive
    // therefore stays in range; only the stored slot is corrupted, which is what status()/archiveAt() read.
    const slot = archivesStorageSlot(corruptCheckpoint);
    logger.warn(`Corrupting archives[${corruptCheckpoint}] to an out-of-range value via setStorageAt`, {
      slot: `0x${slot.toString(16)}`,
    });
    await context.cheatCodes.eth.store(EthAddress.fromString(test.rollup.address), slot, OUT_OF_RANGE);

    // Sanity: the rollup wrapper reads the corrupted value as raw Buffer32 bytes without throwing (pre-fix
    // this conversion to Fr threw and bricked the read).
    const corruptedArchive = await rollupContract.archiveAt(corruptCheckpoint);
    expect(corruptedArchive.toString()).toEqual(`0x${OUT_OF_RANGE.toString(16)}`);
    const status = await rollupContract.status(corruptCheckpoint);
    expect(status.pendingArchive.toString()).toEqual(`0x${OUT_OF_RANGE.toString(16)}`);

    // 5. Stop the misbehaving validator's sequencer so it no longer proposes; its key remains in the committee.
    logger.warn(`Stopping the misbehaving validator's sequencer.`);
    await badNode.getSequencer()!.stop();

    // 6. Start the three honest validators' sequencers. They were created against the clean chain, so
    // starting them now exercises the L1-sync invalidation path against the corrupted pending tip.
    logger.warn(`Starting the three honest validators' sequencers.`);
    await Promise.all(honestNodes.map(n => n.getSequencer()!.start()));

    // 7a. The observer must not brick reading the out-of-range pending tip: its L1 sync point keeps advancing.
    const observerL1Before = observerArchiver.getL1BlockNumber() ?? 0n;
    await retryUntil(
      () => {
        const syncedL1 = observerArchiver.getL1BlockNumber() ?? 0n;
        logger.info(`Observer L1 sync point`, { syncedL1: syncedL1.toString(), before: observerL1Before.toString() });
        return syncedL1 > observerL1Before;
      },
      'observer keeps syncing L1 past the out-of-range archive root',
      test.L2_SLOT_DURATION_IN_S * 8,
      0.5,
    );
    logger.warn(`Observer L1 sync advanced past the corrupted pending tip.`);

    // 7b. The under-attested checkpoint 1 gets invalidated: the on-chain pending checkpoint number rolls back
    // below 1 (to 0). Invalidation is what proves the honest nodes successfully read the corrupted pending
    // tip, computed insufficient attestations, and acted on it.
    await retryUntil(
      async () => {
        const pending = await rollupContract.getCheckpointNumber();
        logger.info(`On-chain pending checkpoint number`, { pending });
        return pending < corruptCheckpoint;
      },
      'under-attested checkpoint 1 is invalidated (pending checkpoint rolls back)',
      test.L2_SLOT_DURATION_IN_S * 10,
      0.5,
    );
    logger.warn(`Under-attested checkpoint 1 was invalidated.`);

    // 7c. The chain heals: honest proposers build a fresh, properly-attested checkpoint past the bad one, so
    // the on-chain checkpoint number climbs back to 2 (a clean rebuild of 1 plus a new 2).
    const healTarget = CheckpointNumber(2);
    await test.waitUntilCheckpointNumber(healTarget, test.L2_SLOT_DURATION_IN_S * 12);
    expect(await rollupContract.getCheckpointNumber()).toBeGreaterThanOrEqual(healTarget);
    logger.warn(`Chain healed: produced checkpoint ${healTarget} past the invalidated checkpoint.`);

    // And the observer indexes the healed chain too, confirming honest sync survived and caught up.
    await retryUntil(
      async () => {
        const checkpointed = (await observerNode.getChainTips()).checkpointed.checkpoint.number;
        logger.info(`Observer checkpointed checkpoint`, { checkpointed });
        return checkpointed >= healTarget;
      },
      `observer syncs the healed chain up to checkpoint ${healTarget}`,
      test.L2_SLOT_DURATION_IN_S * 8,
      0.5,
    );

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
