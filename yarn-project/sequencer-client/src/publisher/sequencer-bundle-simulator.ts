import type { EpochCache } from '@aztec/epoch-cache';
import { Multicall3, type RollupContract, buildSimulationOverridesStateOverride } from '@aztec/ethereum/contracts';
import { type L1TxUtils, MAX_L1_TX_LIMIT } from '@aztec/ethereum/l1-tx-utils';
import { formatViemError } from '@aztec/ethereum/utils';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { getLastL1SlotTimestampForL2Slot } from '@aztec/stdlib/epoch-helpers';

import type { Hex, StateOverride } from 'viem';

import type { RequestWithExpiry } from './sequencer-publisher.js';

/** A request that was dropped by bundle simulation, with the decoded revert reason. */
export type DroppedRequest = {
  request: RequestWithExpiry;
  revertReason: string | undefined;
  returnData: Hex | undefined;
};

/**
 * Result of {@link SequencerBundleSimulator.simulate}.
 *
 * - `success`: simulation succeeded. `requests` is the filtered survivor list, `gasLimit` is
 *   the bumped gas limit derived from `gasUsed` (plus blob evaluation gas). `droppedRequests`
 *   lists the entries that were observed to revert in simulation.
 * - `fallback`: the node does not support eth_simulateV1 (or the simulate call threw). The
 *   caller should send `requests` as-is with a safe gas limit (e.g. {@link MAX_L1_TX_LIMIT}).
 *   `droppedRequests` carries any entries that the first pass already proved reverted, so the
 *   caller does not re-include them when the second pass falls back.
 * - `aborted`: the bundle cannot be sent. `droppedRequests` contains only entries that were
 *   actually observed to revert (so they can be reported as simulation failures); it is empty
 *   when the abort was caused by an empty input bundle.
 */
export type BundleSimulateResult =
  | { kind: 'success'; requests: RequestWithExpiry[]; gasLimit: bigint; droppedRequests: DroppedRequest[] }
  | { kind: 'fallback'; requests: RequestWithExpiry[]; droppedRequests: DroppedRequest[] }
  | { kind: 'aborted'; reason: AbortReason; droppedRequests: DroppedRequest[] };

export type AbortReason = 'empty-bundle' | 'all-reverted' | 'second-pass-reverts';

type SimulatePassResult =
  | { kind: 'decoded'; survivors: RequestWithExpiry[]; droppedRequests: DroppedRequest[]; gasUsed: bigint }
  | { kind: 'fallback' };

/**
 * Bundle-level simulator for the aggregate3 payload that `SequencerPublisher` is about to send.
 *
 * Runs `eth_simulateV1` against `Multicall3.aggregate3`, drops entries that revert, and returns
 * a gasLimit for the survivors. When `eth_simulateV1` is unavailable, signals fallback to the
 * caller so it can send the bundle as-is with a conservative gas limit.
 */
export class SequencerBundleSimulator {
  private readonly log: Logger;

  constructor(
    private readonly deps: {
      getL1TxUtils: () => L1TxUtils;
      rollupContract: RollupContract;
      epochCache: EpochCache;
      log?: Logger;
    },
  ) {
    this.log = deps.log ?? createLogger('sequencer:publisher:bundle-simulator');
  }

  /**
   * Simulates the given bundle near the end of the target slot and filters out entries
   * that revert.
   *
   * - If all entries pass on the first pass, returns `success` with the gasLimit.
   * - If some entries revert, re-simulates the survivors. If the second pass is clean, returns
   *   `success` with the survivors and dropped entries. If the second pass surfaces any revert,
   *   returns `aborted` — we refuse to send a bundle whose composition still has internal
   *   reverts after one round of filtering.
   * - If eth_simulateV1 is unavailable, returns `fallback`. The caller is expected to send the
   *   bundle as-is with a safe gas limit.
   *
   * The simulation `block.timestamp` is the last L1 slot timestamp inside the target L2 slot.
   * This still maps to the target L2 slot for propose's `validateHeader` and EIP-712 signature
   * checks, while avoiding eth_simulateV1 rejecting a child block whose timestamp is not strictly
   * greater than the current L1 head.
   *
   * Known limitation: on networks where L1 is mining behind cadence (missed L1 slots, anvil with
   * overridden timestamps), the actual `block.timestamp` at send time can land in the prior L2
   * slot. In that case `propose` would revert silently inside the multicall. The simulator does
   * not detect this case because it simulates inside the target slot — the prior implementation
   * used `min(predictedNextL1Ts, targetTimestamp)` to surface this failure mode at simulate time.
   */
  public async simulate(validRequests: RequestWithExpiry[], targetSlot: SlotNumber): Promise<BundleSimulateResult> {
    if (validRequests.length === 0) {
      return { kind: 'aborted', reason: 'empty-bundle', droppedRequests: [] };
    }
    // Pin the publisher we'll use across the whole simulate call so that the publisher's rotation
    // can't change l1TxUtils mid-flight.
    const l1TxUtils = this.deps.getL1TxUtils();

    const proposeRequest = validRequests.find(r => r.action === 'propose');
    const simulateTimestamp = getLastL1SlotTimestampForL2Slot(targetSlot, this.deps.epochCache.getL1Constants());
    const firstPassOverrides = await this.buildStateOverrides(!!proposeRequest);

    const firstPass = await this.simulateAndDecode(l1TxUtils, validRequests, simulateTimestamp, firstPassOverrides);

    if (firstPass.kind === 'fallback') {
      this.log.warn('Bundle simulate fallback (eth_simulateV1 unavailable); caller will send bundle as-is', {
        actions: validRequests.map(r => r.action),
      });
      return { kind: 'fallback', requests: validRequests, droppedRequests: [] };
    }

    if (firstPass.survivors.length === 0) {
      this.log.warn('All bundle entries dropped in simulation; aborting send', {
        actions: validRequests.map(r => r.action),
      });
      return { kind: 'aborted', reason: 'all-reverted', droppedRequests: firstPass.droppedRequests };
    }

    if (firstPass.droppedRequests.length === 0) {
      return this.buildSuccessResult(l1TxUtils, firstPass.survivors, [], firstPass.gasUsed, proposeRequest);
    }

    this.log.warn('Some bundle entries reverted; re-simulating reduced bundle', {
      droppedActions: firstPass.droppedRequests.map(d => d.request.action),
      remainingActions: firstPass.survivors.map(r => r.action),
    });

    // Rebuild overrides for the reduced bundle: if propose was dropped, we no longer need the blob-check override
    const proposeSurvived = proposeRequest !== undefined && firstPass.survivors.includes(proposeRequest);
    const secondPassOverrides = proposeSurvived ? firstPassOverrides : await this.buildStateOverrides(false);
    const secondPass = await this.simulateAndDecode(
      l1TxUtils,
      firstPass.survivors,
      simulateTimestamp,
      secondPassOverrides,
    );

    if (secondPass.kind === 'fallback') {
      this.log.warn(
        'Bundle simulate errored on second pass (eth_simulateV1 unavailable); sending first-pass survivors as-is',
        {
          actions: firstPass.survivors.map(r => r.action),
          droppedActions: firstPass.droppedRequests.map(d => d.request.action),
        },
      );
      return { kind: 'fallback', requests: firstPass.survivors, droppedRequests: firstPass.droppedRequests };
    }

    // We refuse to chase reverts through repeated trimming: anything other than a clean second pass aborts the whole send
    if (secondPass.droppedRequests.length > 0) {
      this.log.error('Re-simulate surfaced reverts; aborting send', {
        secondPassDroppedActions: secondPass.droppedRequests.map(d => d.request.action),
      });
      return {
        kind: 'aborted',
        reason: 'second-pass-reverts',
        droppedRequests: [...firstPass.droppedRequests, ...secondPass.droppedRequests],
      };
    }

    return this.buildSuccessResult(
      l1TxUtils,
      secondPass.survivors,
      firstPass.droppedRequests,
      secondPass.gasUsed,
      proposeRequest,
    );
  }

  private buildSuccessResult(
    l1TxUtils: L1TxUtils,
    survivors: RequestWithExpiry[],
    droppedRequests: DroppedRequest[],
    bundleGasUsed: bigint,
    proposeRequest: RequestWithExpiry | undefined,
  ): BundleSimulateResult {
    const proposeSurvived = proposeRequest !== undefined && survivors.includes(proposeRequest);
    const blobEvaluationGas = proposeSurvived ? (proposeRequest?.blobEvaluationGas ?? 0n) : 0n;
    const gasLimit = this.computeGasLimit(l1TxUtils, bundleGasUsed, blobEvaluationGas);
    this.log.debug('Bundle simulate complete', {
      survivingRequests: survivors.length,
      bundleGasUsed,
      gasLimit,
      actions: survivors.map(r => r.action),
    });
    return { kind: 'success', requests: survivors, gasLimit, droppedRequests };
  }

  /**
   * `gasLimit = bumpGasLimit(ceil(gasUsed * 64 / 63))`, plus blob evaluation gas if a propose
   * survived, capped at the L1 block gas limit.
   */
  private computeGasLimit(l1TxUtils: L1TxUtils, bundleGasUsed: bigint, blobEvaluationGas: bigint): bigint {
    const gasUsedWithEip150 = (bundleGasUsed * 64n + 62n) / 63n;
    const gasLimit = l1TxUtils.bumpGasLimit(gasUsedWithEip150) + blobEvaluationGas;
    return gasLimit > MAX_L1_TX_LIMIT ? MAX_L1_TX_LIMIT : gasLimit;
  }

  /**
   * eth_simulateV1 cannot carry blob sidecar data, so disable the rollup's on-chain blob check
   * when a propose is in the bundle.
   */
  private buildStateOverrides(hasProposeAction: boolean): Promise<StateOverride> {
    return buildSimulationOverridesStateOverride(
      this.deps.rollupContract,
      hasProposeAction ? { disableBlobCheck: true } : undefined,
    );
  }

  private async simulateAndDecode(
    l1TxUtils: L1TxUtils,
    requests: RequestWithExpiry[],
    simulateTimestamp: bigint,
    stateOverrides: StateOverride,
  ): Promise<SimulatePassResult> {
    let simResult: Awaited<ReturnType<typeof Multicall3.simulateAggregate3>>;
    try {
      simResult = await Multicall3.simulateAggregate3(
        requests.map(r => ({ to: r.request.to! as Hex, data: r.request.data! as Hex, abi: r.request.abi })),
        l1TxUtils,
        {
          blockOverrides: { time: simulateTimestamp, gasLimit: MAX_L1_TX_LIMIT * 2n },
          stateOverrides,
          gas: MAX_L1_TX_LIMIT,
          fallbackGasEstimate: MAX_L1_TX_LIMIT,
        },
      );
    } catch (err) {
      this.log.warn('Bundle simulate threw; treating as fallback', {
        err: formatViemError(err),
        actions: requests.map(r => r.action),
      });
      return { kind: 'fallback' };
    }

    if (simResult.kind === 'fallback') {
      return { kind: 'fallback' };
    }

    const survivors: RequestWithExpiry[] = [];
    const droppedRequests: DroppedRequest[] = [];
    for (let i = 0; i < requests.length; i++) {
      const entry = simResult.entries[i];
      if (entry.success) {
        survivors.push(requests[i]);
        continue;
      }
      droppedRequests.push({
        request: requests[i],
        revertReason: entry.revertReason,
        returnData: entry.returnData,
      });
    }
    return { kind: 'decoded', survivors, droppedRequests, gasUsed: simResult.gasUsed };
  }
}
