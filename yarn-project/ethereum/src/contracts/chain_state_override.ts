import { toHex as toPaddedHex } from '@aztec/foundation/bigint-buffer';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { StateOverride } from 'viem';

import { type FeeHeader, RollupContract } from './rollup.js';

export type PendingCheckpointOverrideState = {
  archive?: Fr;
  feeHeader?: FeeHeader;
};

/** Describes the simulated L1 rollup state that downstream calls should observe. */
export type SimulationOverridesPlan = {
  pendingCheckpointNumber?: CheckpointNumber;
  pendingCheckpointState?: PendingCheckpointOverrideState;
  disableBlobCheck?: boolean;
};

/** Builds a single-checkpoint simulation plan before it is translated into a viem state override. */
export class SimulationOverridesBuilder {
  private pendingCheckpointNumber?: CheckpointNumber;
  private pendingCheckpointState?: PendingCheckpointOverrideState;
  private disableBlobCheck = false;

  /** Starts from an existing plan so callers can extend or specialize it. */
  public static from(plan: SimulationOverridesPlan | undefined): SimulationOverridesBuilder {
    return new SimulationOverridesBuilder().merge(plan);
  }

  /** Merges another plan into this builder. Later values win. */
  public merge(plan: SimulationOverridesPlan | undefined): this {
    if (!plan) {
      return this;
    }

    this.pendingCheckpointNumber = plan.pendingCheckpointNumber;
    this.pendingCheckpointState = plan.pendingCheckpointState
      ? { ...(this.pendingCheckpointState ?? {}), ...plan.pendingCheckpointState }
      : this.pendingCheckpointState;
    this.disableBlobCheck = this.disableBlobCheck || (plan.disableBlobCheck ?? false);

    return this;
  }

  /** Sets the checkpoint number that archive and fee header overrides should attach to. */
  public forPendingCheckpoint(pendingCheckpointNumber: CheckpointNumber | undefined): this {
    this.pendingCheckpointNumber = pendingCheckpointNumber;
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
    if (!this.pendingCheckpointState && this.pendingCheckpointNumber === undefined && !this.disableBlobCheck) {
      return undefined;
    }

    return {
      pendingCheckpointNumber: this.pendingCheckpointNumber,
      pendingCheckpointState: this.pendingCheckpointState,
      disableBlobCheck: this.disableBlobCheck || undefined,
    };
  }

  private assertPendingCheckpointNumber(): void {
    if (this.pendingCheckpointNumber === undefined) {
      throw new Error('pendingCheckpointNumber must be set before attaching archive or fee header overrides');
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

  if (plan.pendingCheckpointNumber !== undefined) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(await rollup.makePendingCheckpointNumberOverride(plan.pendingCheckpointNumber)),
    );
  }

  if (plan.pendingCheckpointState && plan.pendingCheckpointNumber === undefined) {
    throw new Error('pendingCheckpointState requires pendingCheckpointNumber to be set');
  }

  if (plan.pendingCheckpointState?.archive) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        rollup.makeArchiveOverride(plan.pendingCheckpointNumber!, plan.pendingCheckpointState.archive),
      ),
    );
  }

  if (plan.pendingCheckpointState?.feeHeader) {
    rollupStateDiff.push(
      ...extractRollupStateDiff(
        await rollup.makeFeeHeaderOverride(plan.pendingCheckpointNumber!, plan.pendingCheckpointState.feeHeader),
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
