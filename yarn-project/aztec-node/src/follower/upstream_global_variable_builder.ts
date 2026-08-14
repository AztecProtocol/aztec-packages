import type { SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { type L1RollupConstants, getSlotAtNextL1Block, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { GasFees } from '@aztec/stdlib/gas';
import type { CheckpointGlobalVariables, FeeProvider, GlobalVariableBuilder } from '@aztec/stdlib/tx';

/** Chain identity and timing a follower needs to build checkpoint globals. */
export type UpstreamGlobalVariableBuilderConfig = {
  l1ChainId: number;
  rollupVersion: number;
} & Pick<L1RollupConstants, 'slotDuration' | 'l1GenesisTime' | 'ethereumSlotDuration'>;

/**
 * The slice of the follower's local block source needed to locate the upstream's fee prediction window: the
 * checkpointed tip is the follower's replica of the pending checkpoint the upstream prices against.
 */
export type LocalChainTipSource = Pick<L2BlockSource, 'getBlockData'>;

/**
 * Builds the checkpoint global variables a follower node's public-call simulator needs, taking the mana min fee
 * from the upstream node's fee predictions instead of from the rollup contract. Everything else (chain id,
 * rollup version, slot timestamp) is pure arithmetic over the rollup constants the upstream reported, so a
 * follower needs no L1 connection to simulate public calls.
 *
 * This is an approximation of `GlobalVariableBuilder`, which reads `rollup.getManaMinFeeAt(timestamp)` for the
 * exact slot under an exact chain-state override. Two deviations follow from only having the upstream's fee
 * RPCs to work with:
 *
 * - **The fee is picked from a prediction window rather than evaluated at the slot.**
 *   `getPredictedMinFees` returns one entry per slot of the fee oracle's lag window, the first of which is the
 *   min fee at the first slot the upstream could checkpoint into. We index into it by how far the requested
 *   slot is past that starting slot, clamping to the first entry for slots at or before it and to the last
 *   entry for slots beyond the window. Within the window the prediction assumes target mana usage per
 *   checkpoint, so an unusually full or empty chain drifts from the exact value; past the window the fee is a
 *   floor rather than an estimate.
 * - **The simulation overrides plan is ignored.** The plan exists to re-price against a pipelined proposed
 *   checkpoint or to neutralize a prune, and it can only be applied as an `eth_call` state override. The
 *   upstream instead prices against its own live view of the pending chain, which already accounts for the
 *   pending checkpoint but not for a checkpoint proposed-but-not-yet-published.
 *
 * The practical effect is that a simulated transaction may be quoted a min fee that differs slightly from the
 * one the sequencer writes into the block that ultimately includes it. Simulation is advisory (callers add
 * headroom on top of the quoted fee), and the follower's own numbers stay consistent with the upstream that
 * will actually receive the transaction.
 */
export class UpstreamGlobalVariableBuilder implements GlobalVariableBuilder {
  private readonly chainId: Fr;
  private readonly version: Fr;

  constructor(
    private readonly feeProvider: FeeProvider,
    private readonly blockSource: LocalChainTipSource,
    private readonly dateProvider: DateProvider,
    private readonly config: UpstreamGlobalVariableBuilderConfig,
    private readonly log: Logger = createLogger('node:upstream-global-variable-builder'),
  ) {
    this.chainId = new Fr(config.l1ChainId);
    this.version = new Fr(config.rollupVersion);
  }

  public async buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    _simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<CheckpointGlobalVariables> {
    const { chainId, version } = this;
    const timestamp = getTimestampForSlot(slotNumber, this.config);
    const gasFees = await this.getMinFeesAtSlot(slotNumber);
    return { chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees };
  }

  /**
   * Picks the entry of the upstream's fee prediction window that best matches the given slot. Entry `i` is the
   * prediction for the slot `i` slots past the start of the window, so a slot `d` slots past that start maps to
   * entry `d`: entry 0 for any slot at or before the start, and the last entry for anything past the window.
   */
  private async getMinFeesAtSlot(slotNumber: SlotNumber): Promise<GasFees> {
    const fees = await this.feeProvider.getPredictedMinFees();
    if (fees.length === 0) {
      throw new Error('Upstream node returned no min fee predictions; cannot build checkpoint global variables');
    }

    const firstPredictedSlot = await this.getFirstPredictedSlot();
    const slotsAhead = Math.max(slotNumber - firstPredictedSlot, 0);
    const index = Math.min(slotsAhead, fees.length - 1);
    this.log.trace(`Using upstream min fee prediction ${index} of ${fees.length} for slot ${slotNumber}`, {
      slotNumber,
      firstPredictedSlot,
      index,
    });
    return fees[index];
  }

  /**
   * Estimates the slot the upstream's prediction window starts at. The upstream starts it at
   * `max(currentSlot, slotAtNextL1Block, effectivePendingCheckpoint.slot + 1)`: the first slot it could still
   * checkpoint into. The follower reproduces `slotAtNextL1Block` exactly from the wall clock and the rollup
   * constants, and stands in for the pending checkpoint with its own replica of it, the slot of the last block
   * whose enclosing checkpoint it has seen published on L1.
   *
   * Two residual approximations remain, both of which can only shift the window by a slot or two around a
   * chain-tip transition. The upstream's `currentSlot` is read off the L1 block it pins its queries to, which
   * a follower has no way to observe (the wall-clock term covers it except when L1 is producing blocks late).
   * And the upstream's checkpoint is the *effective* one, taken with a due prune applied at the start of the
   * window, so while a prune is pending the follower's replicated tip is the slot of a checkpoint the upstream
   * has already discarded. Landing on a neighbouring entry costs at most one slot of congestion drift.
   */
  private async getFirstPredictedSlot(): Promise<SlotNumber> {
    const checkpointedTip = await this.blockSource.getBlockData({ tag: 'checkpointed' });
    const checkpointedTipSlot = checkpointedTip?.header.globalVariables.slotNumber;
    const slotAtNextL1Block = getSlotAtNextL1Block(BigInt(this.dateProvider.nowInSeconds()), this.config);
    return checkpointedTipSlot === undefined
      ? slotAtNextL1Block
      : SlotNumber(Math.max(slotAtNextL1Block, SlotNumber.add(checkpointedTipSlot, 1)));
  }
}
