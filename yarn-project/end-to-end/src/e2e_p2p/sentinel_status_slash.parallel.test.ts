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
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { awaitCommitteeExists } from './shared.js';

/**
 * Exercises the sentinel's six-case proposer-status taxonomy end-to-end by driving each of the
 * status variants via in-tree validator-config flags (no jest stubbing of internals):
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
const BOOT_NODE_UDP_PORT = 4700;
const ETHEREUM_SLOT_DURATION = process.env.CI ? 8 : 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;
const BLOCK_DURATION_MS = ETHEREUM_SLOT_DURATION * 500;
const AZTEC_EPOCH_DURATION = 2;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;
const SLASHING_QUORUM = 3;
const SLASHING_ROUND_SIZE_IN_EPOCHS = 2;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-status-slash-'));

describe('e2e_p2p_sentinel_status_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[] = [];
  let rollup: RollupContract;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_sentinel_status_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      startProverNode: true,
      initialConfig: {
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
        mockGossipSubNetwork: true,
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
      },
    });

    await t.setup();
    await t.applyBaseSetup();

    ({ rollup } = await t.getContracts());

    // Advance until the committee is populated.
    let epoch = EpochNumber(4);
    await retryUntil(
      async () => {
        await t.ctx.cheatCodes.rollup.advanceToEpoch(epoch);
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
    if (nodes.length > 0) {
      await t.stopNodes(nodes);
      nodes = [];
    }
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

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

  it('slashes an attestor that gets stopped after the network is running', async () => {
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);
    await awaitCommitteeExists({ rollup, logger: t.logger });

    // Pick the last node as the one to stop so that target proposer rotation is unaffected.
    const targetIdx = NUM_VALIDATORS - 1;
    const targetAddress = (nodes[targetIdx] as any).getSequencer()!.validatorAddresses![0] as EthAddress;
    t.logger.warn(`Stopping node ${targetIdx} (validator ${targetAddress})`);
    await tryStop(nodes[targetIdx]);
    // Remove from the array we will tear down in afterEach to avoid double-stop.
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
    const maliciousNodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, ...maliciousOverride },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      0,
    );
    const targetAddress = (maliciousNodes[0] as any).getSequencer()!.validatorAddresses![0] as EthAddress;
    t.logger.warn(`Malicious node validator address: ${targetAddress}`, { maliciousOverride });

    const honestNodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS - 1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      1,
    );

    nodes = [...maliciousNodes, ...honestNodes];

    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);
    await awaitCommitteeExists({ rollup, logger: t.logger });
    await t.monitor.waitUntilCheckpoint(CheckpointNumber(1));

    return targetAddress;
  }

  /**
   * Finds the next slot at which `targetAddress` is the proposer and warps L1 time to the slot
   * just before it (so the proposer-pipelining build phase for the target's slot lands on the
   * malicious node immediately, with no need to poll for the slot to come around naturally).
   *
   * Probes the NEXT epoch's slots only (further epochs revert with `EpochNotStable`). If the
   * target isn't selected next epoch, advances one epoch and tries again.
   */
  async function warpToSlotBeforeTargetProposer(targetAddress: EthAddress): Promise<SlotNumber> {
    const epochCache = (nodes[0] as TestAztecNodeService).epochCache;
    const cheatCodes = t.ctx.cheatCodes.rollup;
    const maxEpochAttempts = 20;

    for (let attempt = 0; attempt < maxEpochAttempts; attempt++) {
      const currentSlot = Number(await cheatCodes.getSlot());
      const currentEpoch = Math.floor(currentSlot / AZTEC_EPOCH_DURATION);
      // Probe every slot of the next epoch. The current epoch is partly elapsed and the second-next
      // epoch's committee may revert with EpochNotStable, so the next epoch is the only fully
      // available window. Scan the WHOLE epoch — both slot parities: the proposer is a different
      // RANDAO-shuffled committee member per slot, so probing only part of the epoch can
      // systematically never land on the target. (Deriving the start from `currentSlot +
      // minBufferSlots` previously collapsed this to a single, always-odd slot whenever the buffer
      // was comparable to AZTEC_EPOCH_DURATION — here both are 2 — leaving the 1-of-N target
      // effectively unreachable. The pre-warp buffer is unnecessary: landing at `targetSlot - 2`
      // below already gives the network a full slot of real-time to settle after any warp.)
      const searchStart = (currentEpoch + 1) * AZTEC_EPOCH_DURATION;
      const searchEnd = (currentEpoch + 2) * AZTEC_EPOCH_DURATION - 1;

      let targetSlot: number | undefined;
      for (let s = searchStart; s <= searchEnd; s++) {
        const proposer = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(s));
        if (proposer && targetAddress.equals(proposer)) {
          targetSlot = s;
          break;
        }
      }

      if (targetSlot === undefined) {
        t.logger.info(`Target not selected as proposer in slots ${searchStart}..${searchEnd}; advancing one epoch`);
        await cheatCodes.advanceToNextEpoch();
        continue;
      }

      // Land 2 slots before the target (clamped so we never warp backwards). The malicious's
      // sequencer pipelines for slot N during slot N-1, so landing at N-2 gives the network one
      // full slot (N-1) of real-time to settle after the warp before the malicious starts
      // building. Use the absolute-slot helper rather than `advanceSlots(N)` so any real-time
      // elapsed between the slot search above and this call doesn't push us past the intended
      // landing slot.
      const landingSlot = SlotNumber(Math.max(targetSlot - 2, currentSlot));
      t.logger.warn(
        `Target proposes at slot ${targetSlot}; warping to slot ${landingSlot} (target is 2 slots ahead to let gossipsub stabilise before the malicious broadcasts)`,
      );
      if (landingSlot > currentSlot) {
        await cheatCodes.advanceToSlot(landingSlot);
      }
      return SlotNumber(targetSlot);
    }

    throw new Error(
      `Target proposer ${targetAddress} not found with sufficient buffer within ${maxEpochAttempts} epochs`,
    );
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
    t.logger.warn(
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
    t.logger.warn(`All ${observerNodes.length} observers recorded attestation-missed for ${targetAddress}`);
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
    t.logger.warn(`Detected ${offenses.length} INACTIVITY offense(s) for ${targetAddress}`, { offenses });
    expect(unique(offenses.map(o => o.validator.toString()))).toEqual([targetAddress.toString()]);
    expect(unique(offenses.map(o => o.offenseType))).toEqual([OffenseType.INACTIVITY]);
  }
});
