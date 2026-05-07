import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { StateOverride } from 'viem';

import { type FeeHeader, RollupContract } from './rollup.js';

export type PendingCheckpointOverrideState = {
  archive?: Fr;
  feeHeader?: FeeHeader;
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
};

/** Builds a single-checkpoint simulation plan before it is translated into a viem state override. */
export class SimulationOverridesBuilder {
  private chainTipsOverride?: ChainTipsOverride;
  private pendingCheckpointState?: PendingCheckpointOverrideState;
  private disableBlobCheck = false;

  /** Starts from an existing plan so callers can extend or specialize it. */
  public static from(plan: SimulationOverridesPlan | undefined): SimulationOverridesBuilder {
    return new SimulationOverridesBuilder().merge(plan);
  }

  /** Merges another plan into this builder. Later values win on a per-half basis for chain tips. */
  public merge(plan: SimulationOverridesPlan | undefined): this {
    if (!plan) {
      return this;
    }

    if (plan.chainTipsOverride) {
      this.chainTipsOverride = { ...(this.chainTipsOverride ?? {}), ...plan.chainTipsOverride };
    }
    this.pendingCheckpointState = plan.pendingCheckpointState
      ? { ...(this.pendingCheckpointState ?? {}), ...plan.pendingCheckpointState }
      : this.pendingCheckpointState;
    this.disableBlobCheck = this.disableBlobCheck || (plan.disableBlobCheck ?? false);

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

  /** Disables blob checking for simulations that cannot provide DA inputs. */
  public withoutBlobCheck(): this {
    this.disableBlobCheck = true;
    return this;
  }

  /** Builds the final plan, or `undefined` when no overrides were configured. */
  public build(): SimulationOverridesPlan | undefined {
    if (!this.pendingCheckpointState && !this.chainTipsOverride && !this.disableBlobCheck) {
      return undefined;
    }

    return {
      chainTipsOverride: this.chainTipsOverride,
      pendingCheckpointState: this.pendingCheckpointState,
      disableBlobCheck: this.disableBlobCheck || undefined,
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
    rollupStateDiff.push(...extractRollupStateDiff(await rollup.makeChainTipsOverride(plan.chainTipsOverride)));
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

  if (plan.pendingCheckpointState?.feeHeader) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        await rollup.makeFeeHeaderOverride(plan.chainTipsOverride!.pending!, plan.pendingCheckpointState.feeHeader),
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
