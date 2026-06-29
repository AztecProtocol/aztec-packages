import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import { RollupContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { unique } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { OffenseType } from '@aztec/slasher';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { ValidatorStatusInSlot } from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import 'jest-extended';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { awaitCommitteeExists, findUpcomingProposerSlot } from './setup.js';

/**
 * Exercises the sentinel's six-case proposer-status taxonomy end-to-end by driving each of the
 * status variants via in-tree validator-config flags (no jest stubbing of internals).
 *
 * Setup: MultiNodeTestContext on the in-memory mock-gossip bus (no real libp2p). 6 validators,
 * ethSlot varies by CI (4s local / 8s CI), aztecSlot=2x ethSlot, epoch=2, proofSubEpochs=1024,
 * minTxsPerBlock=0, inboxLag=2, sentinelEnabled, fake prover.
 * Each it runs as an isolated CI job (parallel convention).
 *
 *   1. `checkpoint-unvalidated` (case 3) — one validator runs with `broadcastInvalidBlockProposal`,
 *      so honest observers reject its block proposals (state_mismatch) and never push them to
 *      their archivers. When the checkpoint proposal arrives, observers fail to load the last
 *      block → record `unvalidated`; the sentinel slashes the proposer for inactivity.
 *
 *   2. `checkpoint-invalid` (case 4) — one validator runs with
 *      `broadcastInvalidCheckpointProposalOnly`, so its block proposals stay valid (pushed to
 *      observers' archivers) but its checkpoint proposal carries a random archive. Observers
 *      load the last block, find an archive mismatch, and record `invalid`; the sentinel
 *      slashes the proposer for inactivity.
 *
 *   3. Successful re-execution + missing attestor (case 5) — all six validators start
 *      honest, then one is stopped mid-test. The stopped node misses its own proposer slots
 *      and stops attesting to others; the sentinel slashes it for inactivity.
 */

const TEST_TIMEOUT = 1_000_000;
jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 6;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = process.env.CI ? 8 : 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;
const BLOCK_DURATION_MS = ETHEREUM_SLOT_DURATION * 500;
const AZTEC_EPOCH_DURATION = 2;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;
const SLASHING_QUORUM = 3;
const SLASHING_ROUND_SIZE_IN_EPOCHS = 2;

describe('multi-node/slashing/sentinel_status_slash', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[] = [];
  let rollup: RollupContract;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      anvilSlotsInAnEpoch: 4,
      listenAddress: '127.0.0.1',
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      blockDurationMs: BLOCK_DURATION_MS,
      aztecEpochDuration: AZTEC_EPOCH_DURATION,
      aztecProofSubmissionEpochs: 1024,
      minTxsPerBlock: 0,
      inboxLag: 2,
      sentinelEnabled: true,
      // A single proposer-fault slot in an epoch gives missed/total = 1/6 ≈ 0.167; threshold
      // 0.1 lets that single fault trip inactivity.
      slashInactivityTargetPercentage: 0.1,
      slashInactivityConsecutiveEpochThreshold: 1,
      slashingQuorum: SLASHING_QUORUM,
      slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE_IN_EPOCHS,
      slashAmountSmall: SLASHING_UNIT,
      slashAmountMedium: SLASHING_UNIT * 2n,
      slashAmountLarge: SLASHING_AMOUNT,
      slashInactivityPenalty: SLASHING_AMOUNT,
      slashSelfAllowed: true,
      // Sentinel evaluates an epoch's performance once this buffer has elapsed past its last slot.
      sentinelEpochEndBufferSlots: 2,
      // Suppress the BROADCASTED_INVALID_BLOCK_PROPOSAL slash so the only slashing signal in
      // tests 1 and 2 is the INACTIVITY offense from the sentinel.
      slashBroadcastedInvalidBlockPenalty: 0n,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    ({ rollup } = await test.getSlashingContracts());

    // Advance until the committee is populated.
    let epoch = EpochNumber(4);
    await retryUntil(
      async () => {
        await test.context.cheatCodes.rollup.advanceToEpoch(epoch);
        const committee = await rollup.getCurrentEpochCommittee();
        if (committee?.length === NUM_VALIDATORS) {
          return true;
        }
        epoch = EpochNumber(epoch + 1);
        return false;
      },
      'epoch with full committee',
      120,
      0,
    );
  });

  afterEach(async () => {
    nodes = [];
    await test.teardown();
  });

  // Spawns one malicious node with broadcastInvalidBlockProposal:true; honest observers reject via
  // re-execution state_mismatch and record `checkpoint-unvalidated` for that proposer slot. The sentinel
  // then emits an INACTIVITY offense. Asserts all honest observers agree on the fault slot and status.
  it('slashes the proposer with INACTIVITY when checkpoint validation records unvalidated', async () => {
    // One malicious node broadcasts invalid block proposals; honest observers reject them via
    // re-execution state_mismatch and therefore never push to their archivers, so the malicious
    // node's checkpoint proposals can't find their last block and observers record `unvalidated`.
    const targetAddress = await spawnMaliciousAndHonestNodes({ broadcastInvalidBlockProposal: true });
    // Warp near the malicious node's proposer slot to keep wall-clock down. We discover the slot at
    // which the fault is actually recorded rather than assuming it is the warped block-proposer
    // slot: the re-execution outcome is keyed by the checkpoint proposal's slot, and a proposer
    // only emits a checkpoint proposal when its slot closes a checkpoint, which does not always
    // coincide with the block-proposer slot we warp to.
    await warpToSlotBeforeTargetProposer(targetAddress);
    // nodes[0] is the malicious node; honest observers are nodes[1..].
    const honestObservers = nodes.slice(1);
    const faultSlot = await findObservedStatusSlot(honestObservers, targetAddress, 'checkpoint-unvalidated');
    await assertAllObserversSentinelStatus(honestObservers, targetAddress, faultSlot, 'checkpoint-unvalidated');
    // The malicious node self-records `checkpoint-valid` for that slot using the locally computed
    // archive (broadcastInvalidBlockProposal only corrupts the broadcast archive, not the
    // proposer's local state).
    await assertAllObserversSentinelStatus([nodes[0]], targetAddress, faultSlot, 'checkpoint-valid');
    await assertInactivityOffenseFor(targetAddress, nodes[1]);
  });

  // Spawns one malicious node with broadcastInvalidCheckpointProposalOnly:true; block proposals are
  // valid (land in archivers) but checkpoint proposals carry a random archive. Observers detect
  // header_mismatch and record `checkpoint-invalid`. The sentinel emits INACTIVITY. Asserts all
  // observers agree and the malicious node self-records `checkpoint-valid`.
  it('slashes the proposer with INACTIVITY when checkpoint validation records invalid', async () => {
    // One malicious node broadcasts invalid CHECKPOINT proposals while keeping the underlying
    // block proposals valid; observers accept the blocks (so they land in the archiver) but
    // reject the checkpoint via header_mismatch, recording `invalid`.
    const targetAddress = await spawnMaliciousAndHonestNodes({ broadcastInvalidCheckpointProposalOnly: true });
    await warpToSlotBeforeTargetProposer(targetAddress);
    const honestObservers = nodes.slice(1);
    const faultSlot = await findObservedStatusSlot(honestObservers, targetAddress, 'checkpoint-invalid');
    await assertAllObserversSentinelStatus(honestObservers, targetAddress, faultSlot, 'checkpoint-invalid');
    // Malicious self-records `checkpoint-valid` for that slot — proposers always consider their
    // own freshly-built proposal valid from their local-state perspective.
    await assertAllObserversSentinelStatus([nodes[0]], targetAddress, faultSlot, 'checkpoint-valid');
    await assertInactivityOffenseFor(targetAddress, nodes[1]);
  });

  // Starts 6 honest validators, waits for the committee, then stops the last validator. Asserts that
  // all remaining observers record `attestation-missed` for the stopped node and that an INACTIVITY
  // offense is emitted for it.
  it('slashes an attestor that gets stopped after the network is running', async () => {
    nodes = await Promise.all(Array.from({ length: NUM_VALIDATORS }, (_, i) => test.createValidatorNodeAt(i)));

    await awaitCommitteeExists({ rollup, logger: test.logger });

    // Pick the last node as the one to stop so that target proposer rotation is unaffected.
    const targetIdx = NUM_VALIDATORS - 1;
    const targetAddress = nodes[targetIdx].getSequencer()!.validatorAddresses![0] as EthAddress;
    test.logger.warn(`Stopping node ${targetIdx} (validator ${targetAddress})`);
    await tryStop(nodes[targetIdx]);
    // Remove from the array so we do not double-stop it on teardown.
    nodes = nodes.filter((_, i) => i !== targetIdx);

    // All remaining nodes are honest observers.
    await assertAllObserversObservedAttestationMissed(nodes, targetAddress);
    await assertInactivityOffenseFor(targetAddress, nodes[0]);
  });

  // -- helpers ------------------------------------------------------------------------------

  /**
   * Spawns 1 malicious node at index 0 with the given config override, then `NUM_VALIDATORS - 1`
   * honest nodes at indices 1..N-1. Returns the malicious node's validator address.
   */
  async function spawnMaliciousAndHonestNodes(maliciousOverride: Partial<AztecNodeConfig>): Promise<EthAddress> {
    const maliciousNode = await test.createValidatorNodeAt(0, maliciousOverride);
    const targetAddress = maliciousNode.getSequencer()!.validatorAddresses![0] as EthAddress;
    test.logger.warn(`Malicious node validator address: ${targetAddress}`, { maliciousOverride });

    const honestNodes = await Promise.all(
      Array.from({ length: NUM_VALIDATORS - 1 }, (_, i) => test.createValidatorNodeAt(i + 1)),
    );

    nodes = [maliciousNode, ...honestNodes];

    await awaitCommitteeExists({ rollup, logger: test.logger });
    await test.monitor.waitUntilCheckpoint(CheckpointNumber(1));

    return targetAddress;
  }

  // Land two slots before an upcoming slot in which `targetAddress` is the proposer, so the network
  // has a slot of real-time to settle before the malicious node (which we control) builds.
  const MIN_LEAD_SLOTS = 2;

  /**
   * Warps L1 time to {@link MIN_LEAD_SLOTS} slots before an upcoming slot in which `targetAddress` is
   * the proposer, so the proposer-pipelining build phase for the target's slot lands on the malicious
   * node with a slot of real-time for the network to settle first.
   *
   * The proposer search is delegated to the shared `findUpcomingProposerSlot`, which scans forward
   * from {@link MIN_LEAD_SLOTS} ahead — examining both epoch parities so the RANDAO-shuffled 1-of-N
   * target is reliably found — and guarantees the returned slot is at least {@link MIN_LEAD_SLOTS}
   * ahead, so the landing warp can never go backwards.
   */
  async function warpToSlotBeforeTargetProposer(targetAddress: EthAddress): Promise<void> {
    const epochCache = (nodes[0] as TestAztecNodeService).epochCache;
    const cheatCodes = test.context.cheatCodes.rollup;
    const targetSlot = await findUpcomingProposerSlot({
      epochCache,
      cheatCodes,
      targetProposer: targetAddress,
      logger: test.logger,
      minLeadSlots: MIN_LEAD_SLOTS,
    });
    // The malicious sequencer pipelines for slot N during N-1, so landing at N - MIN_LEAD_SLOTS leaves
    // slot N-1 of real-time for the network to settle before it broadcasts.
    const landingSlot = SlotNumber(targetSlot - MIN_LEAD_SLOTS);
    if (landingSlot > Number(await cheatCodes.getSlot())) {
      await cheatCodes.advanceToSlot(landingSlot);
    }
  }

  /**
   * Finds the earliest slot at which EVERY honest observer has recorded `expectedStatus` for
   * `targetAddress`. The slot at which the malicious node closes its checkpoint (and so the fault
   * is recorded) is not necessarily the block-proposer slot we warp to, so we discover it rather
   * than assuming it. Requiring cross-observer agreement avoids picking a slot that only one
   * observer saw (e.g. one peer happened to be synced to the malicious proposer's gossip earlier
   * than the others), which would then time out the downstream per-observer assertion. Times out
   * — and therefore fails the test — if no common fault slot is ever recorded, so a genuine
   * failure to detect the malicious proposal is still caught.
   */
  async function findObservedStatusSlot(
    observerNodes: AztecNodeService[],
    targetAddress: EthAddress,
    expectedStatus: ValidatorStatusInSlot,
  ): Promise<SlotNumber> {
    const slot = await retryUntil(
      async () => {
        const slotSets = await Promise.all(
          observerNodes.map(async observerNode => {
            const stats = await observerNode.getValidatorsStats();
            const history = stats.stats[targetAddress.toString()]?.history ?? [];
            return new Set(history.filter(h => h.status === expectedStatus).map(h => Number(h.slot)));
          }),
        );
        if (slotSets.some(s => s.size === 0)) {
          return undefined;
        }
        const [first, ...rest] = slotSets;
        const common = [...first].filter(s => rest.every(other => other.has(s))).sort((a, b) => a - b);
        return common.length > 0 ? SlotNumber(common[0]) : undefined;
      },
      `cross-observer ${expectedStatus} for ${targetAddress}`,
      AZTEC_SLOT_DURATION * 15,
    );
    return slot;
  }

  /**
   * Polls every honest observer node until each has its sentinel record `expectedStatus` for the
   * target at the given slot. Asserts the recorded status matches exactly on every observer.
   */
  async function assertAllObserversSentinelStatus(
    observerNodes: AztecNodeService[],
    targetAddress: EthAddress,
    slot: SlotNumber,
    expectedStatus: ValidatorStatusInSlot,
  ): Promise<void> {
    for (const observerNode of observerNodes) {
      const status = await retryUntil(
        async () => {
          const stats = await observerNode.getValidatorsStats();
          const validator = stats.stats[targetAddress.toString()];
          const entry = validator?.history.find(h => Number(h.slot) === Number(slot));
          return entry?.status;
        },
        `sentinel status for ${targetAddress} at slot ${slot}`,
        AZTEC_SLOT_DURATION * 10,
      );
      expect(status).toEqual(expectedStatus);
    }
    test.logger.warn(
      `All ${observerNodes.length} observers recorded ${expectedStatus} for ${targetAddress} at slot ${slot}`,
    );
  }

  /**
   * Polls every honest observer node until each one has at least one `attestation-missed` entry
   * for the target. Used by the stopped-attestor test where the slot of the miss is
   * non-deterministic.
   */
  async function assertAllObserversObservedAttestationMissed(
    observerNodes: AztecNodeService[],
    targetAddress: EthAddress,
  ): Promise<void> {
    for (const observerNode of observerNodes) {
      const slot = await retryUntil(
        async () => {
          const stats = await observerNode.getValidatorsStats();
          const validator = stats.stats[targetAddress.toString()];
          const miss = validator?.history.find(h => h.status === 'attestation-missed');
          return miss?.slot;
        },
        `attestation-missed entry for ${targetAddress}`,
        AZTEC_SLOT_DURATION * 20,
      );
      expect(slot).toBeDefined();
    }
    test.logger.warn(`All ${observerNodes.length} observers recorded attestation-missed for ${targetAddress}`);
  }

  /** Polls the given honest observer node until an INACTIVITY offense for the target appears. */
  async function assertInactivityOffenseFor(targetAddress: EthAddress, observerNode: AztecNodeService): Promise<void> {
    const offenses = await retryUntil(
      async () => {
        const collected = await observerNode.getSlashOffenses('all');
        const inactivityForTarget = collected.filter(
          o => o.offenseType === OffenseType.INACTIVITY && targetAddress.equals(o.validator),
        );
        return inactivityForTarget.length > 0 ? inactivityForTarget : undefined;
      },
      'inactivity offense for target',
      AZTEC_SLOT_DURATION * 40,
    );
    test.logger.warn(`Detected ${offenses.length} INACTIVITY offense(s) for ${targetAddress}`, { offenses });
    expect(unique(offenses.map(o => o.validator.toString()))).toEqual([targetAddress.toString()]);
    expect(unique(offenses.map(o => o.offenseType))).toEqual([OffenseType.INACTIVITY]);
  }
});
