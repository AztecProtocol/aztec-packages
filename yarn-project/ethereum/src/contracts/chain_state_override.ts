import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import type { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Buffer32 } from '@aztec/foundation/buffer';
import { merge } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { StateOverride } from 'viem';

import { type FeeHeader, RollupContract } from './rollup.js';

/**
 * Override values for the pending checkpoint that the simulation should treat as already applied.
 * Every field is optional at plan-building time so callers can populate them incrementally; whatever
 * is present at translation time is forwarded to the partial `tempCheckpointLogs` helper so the
 * load-bearing `slotNumber` can land even if other fields could not be derived locally.
 */
export type PendingCheckpointOverrideState = {
  archive?: Fr;
  feeHeader?: FeeHeader;
  headerHash?: Fr;
  outHash?: Fr;
  payloadDigest?: Buffer32;
  slotNumber?: SlotNumber;
};

export type ChainTipsOverride = {
  pending?: CheckpointNumber;
  proven?: CheckpointNumber;
};

/** Describes the simulated L1 rollup state that downstream calls should observe. */
export type SimulationOverridesPlan = {
  chainTipsOverride?: ChainTipsOverride;
  pendingCheckpointState?: PendingCheckpointOverrideState;
  disableBlobCheck?: boolean;
  /**
   * L1 block number the plan was built against. When set, reads that translate the plan into a
   * state override (and the downstream eth_call that consumes it) pin to this block so the snapshot
   * matches the block the plan's other inputs were read at, instead of racing `latest` across an L1
   * block boundary.
   */
  l1BlockNumber?: bigint;
};

/** Builds a single-checkpoint simulation plan before it is translated into a viem state override. */
export class SimulationOverridesBuilder {
  private chainTipsOverride?: ChainTipsOverride;
  private pendingCheckpointState?: PendingCheckpointOverrideState;
  private disableBlobCheck = false;
  private l1BlockNumber?: bigint;

  /** Starts from an existing plan so callers can extend or specialize it. */
  public static from(plan: SimulationOverridesPlan | undefined): SimulationOverridesBuilder {
    return new SimulationOverridesBuilder().merge(plan);
  }

  /**
   * Merges another plan into this builder. Later values win on a per-half basis for chain tips,
   * but explicit `undefined` fields in the incoming plan are ignored so they cannot erase a
   * previously-set value.
   */
  public merge(plan: SimulationOverridesPlan | undefined): this {
    if (!plan) {
      return this;
    }

    if (plan.chainTipsOverride) {
      this.chainTipsOverride = merge(this.chainTipsOverride ?? {}, plan.chainTipsOverride);
    }
    if (plan.pendingCheckpointState) {
      this.pendingCheckpointState = merge(this.pendingCheckpointState ?? {}, plan.pendingCheckpointState);
    }
    this.disableBlobCheck = this.disableBlobCheck || (plan.disableBlobCheck ?? false);
    if (plan.l1BlockNumber !== undefined) {
      this.l1BlockNumber = plan.l1BlockNumber;
    }

    return this;
  }

  /**
   * Sets the pending and/or proven checkpoint number overrides. Subsequent calls merge into the existing
   * override on a per-half basis, so callers can set pending in one call and proven in another without
   * clobbering each other.
   */
  public withChainTips(override: ChainTipsOverride): this {
    this.chainTipsOverride = { ...(this.chainTipsOverride ?? {}), ...override };
    return this;
  }

  /** Overrides the archive root for the configured pending checkpoint. */
  public withPendingArchive(archive: Fr): this {
    this.assertPendingCheckpointNumber();
    this.pendingCheckpointState = { ...(this.pendingCheckpointState ?? {}), archive };
    return this;
  }

  /** Overrides the fee header for the configured pending checkpoint. */
  public withPendingFeeHeader(feeHeader: FeeHeader): this {
    this.assertPendingCheckpointNumber();
    this.pendingCheckpointState = { ...(this.pendingCheckpointState ?? {}), feeHeader };
    return this;
  }

  /**
   * Overrides one or more `tempCheckpointLogs` cell fields for the configured pending checkpoint.
   * Fields are independent: any subset can be provided. The translator (`makeTempCheckpointLogOverride`)
   * emits a stateDiff entry per field actually set, so unspecified fields stay at their on-chain
   * values.
   *
   * `slotNumber` is load-bearing for `STFLib.canPruneAtTime`: when the simulation overrides `pending`
   * to a checkpoint that has no on-chain `tempCheckpointLogs` entry yet, the missing slotNumber falls
   * back to 0 and the contract treats the pending tip as belonging to epoch 0, triggering a phantom
   * prune that silently undoes the `pending` override.
   */
  public withPendingTempCheckpointLogFields(fields: {
    headerHash?: Fr;
    outHash?: Fr;
    payloadDigest?: Buffer32;
    slotNumber?: SlotNumber;
  }): this {
    this.assertPendingCheckpointNumber();
    this.pendingCheckpointState = { ...(this.pendingCheckpointState ?? {}), ...fields };
    return this;
  }

  /** Disables blob checking for simulations that cannot provide DA inputs. */
  public withoutBlobCheck(): this {
    this.disableBlobCheck = true;
    return this;
  }

  /** Pins the plan's L1 reads to a specific block number for a consistent snapshot. */
  public withL1BlockNumber(blockNumber: bigint): this {
    this.l1BlockNumber = blockNumber;
    return this;
  }

  /** Builds the final plan, or `undefined` when no overrides were configured. */
  public build(): SimulationOverridesPlan | undefined {
    // An L1 block number on its own produces no state diff, so it does not make an otherwise-empty plan.
    if (!this.pendingCheckpointState && !this.chainTipsOverride && !this.disableBlobCheck) {
      return undefined;
    }

    return {
      chainTipsOverride: this.chainTipsOverride,
      pendingCheckpointState: this.pendingCheckpointState,
      disableBlobCheck: this.disableBlobCheck || undefined,
      l1BlockNumber: this.l1BlockNumber,
    };
  }

  private assertPendingCheckpointNumber(): void {
    if (this.chainTipsOverride?.pending === undefined) {
      throw new Error('withChainTips({ pending }) must be called before attaching archive or fee header overrides');
    }
  }
}

/** Translates a simulation plan into the viem state override shape expected by rollup calls. */
export async function buildSimulationOverridesStateOverride(
  rollup: RollupContract,
  plan: SimulationOverridesPlan | undefined,
): Promise<StateOverride> {
  if (!plan) {
    return [];
  }

  const rollupStateDiff: NonNullable<StateOverride[number]['stateDiff']> = [];

  if (plan.chainTipsOverride) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        await rollup.makeChainTipsOverride(plan.chainTipsOverride, { blockNumber: plan.l1BlockNumber }),
      ),
    );
  }

  if (plan.pendingCheckpointState && plan.chainTipsOverride?.pending === undefined) {
    throw new Error('pendingCheckpointState requires chainTipsOverride.pending to be set');
  }

  if (plan.pendingCheckpointState?.archive) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        rollup.makeArchiveOverride(plan.chainTipsOverride!.pending!, plan.pendingCheckpointState.archive),
      ),
    );
  }

  if (plan.pendingCheckpointState) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        await rollup.makeTempCheckpointLogOverride(plan.chainTipsOverride!.pending!, {
          headerHash: plan.pendingCheckpointState.headerHash,
          outHash: plan.pendingCheckpointState.outHash,
          payloadDigest: plan.pendingCheckpointState.payloadDigest,
          slotNumber: plan.pendingCheckpointState.slotNumber,
          feeHeader: plan.pendingCheckpointState.feeHeader,
        }),
      ),
    );
  }

  if (plan.disableBlobCheck) {
    rollupStateDiff.push({
      slot: toPaddedHex(RollupContract.checkBlobStorageSlot, true),
      value: toPaddedHex(0n, true),
    });
  }

  if (rollupStateDiff.length === 0) {
    return [];
  }

  return [{ address: rollup.address, stateDiff: rollupStateDiff }];
}

function extractRollupStateDiff(override: StateOverride | StateOverride[number] | undefined) {
  const entries = Array.isArray(override) ? override : override ? [override] : [];
  return entries.flatMap(entry => entry.stateDiff ?? []);
}
