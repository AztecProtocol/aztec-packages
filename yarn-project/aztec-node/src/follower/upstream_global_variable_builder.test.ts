import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockData, BlockHash } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, type FeeProvider, GlobalVariables } from '@aztec/stdlib/tx';

import { beforeEach, describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type LocalChainTipSource, UpstreamGlobalVariableBuilder } from './upstream_global_variable_builder.js';

const CONFIG = {
  l1ChainId: 31337,
  rollupVersion: 7,
  slotDuration: 24,
  l1GenesisTime: 1_700_000_000n,
  ethereumSlotDuration: 12,
};

/** One entry per slot of the fee oracle window, the first being the fee at the slot the window starts at. */
const FEES = [new GasFees(0, 100n), new GasFees(0, 110n), new GasFees(0, 120n)];

/** Block metadata carrying just the slot number, which is all the builder reads off the checkpointed tip. */
const blockDataAtSlot = (slot: number): BlockData => ({
  header: BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1), slotNumber: SlotNumber(slot) }),
  }),
  archive: AppendOnlyTreeSnapshot.empty(),
  blockHash: BlockHash.random(),
  checkpointNumber: CheckpointNumber(1),
  indexWithinCheckpoint: IndexWithinCheckpoint(0),
});

describe('UpstreamGlobalVariableBuilder', () => {
  let feeProvider: MockProxy<FeeProvider>;
  let blockSource: MockProxy<LocalChainTipSource>;
  let dateProvider: ManualDateProvider;
  let builder: UpstreamGlobalVariableBuilder;

  beforeEach(() => {
    feeProvider = mock<FeeProvider>();
    feeProvider.getPredictedMinFees.mockResolvedValue(FEES);
    blockSource = mock<LocalChainTipSource>();
    // No checkpointed tip yet, so the window is placed off the wall clock alone.
    blockSource.getBlockData.mockResolvedValue(undefined);
    // At genesis the next L1 block lands 12s in, which still falls in L2 slot 0: the window starts at slot 0.
    dateProvider = new ManualDateProvider(Number(CONFIG.l1GenesisTime) * 1000);
    builder = new UpstreamGlobalVariableBuilder(feeProvider, blockSource, dateProvider, CONFIG);
  });

  const build = (slot: number) =>
    builder.buildCheckpointGlobalVariables(EthAddress.ZERO, AztecAddress.ZERO, SlotNumber(slot));

  const gasFeesAt = (slot: number) => build(slot).then(g => g.gasFees);

  /** Advances the wall clock by whole L2 slots. */
  const advanceSlots = (slots: number) => dateProvider.advanceTime(slots * CONFIG.slotDuration);

  it('derives chain identity and slot timestamp from the rollup constants', async () => {
    const globals = await build(3);

    expect(globals.chainId).toEqual(new Fr(CONFIG.l1ChainId));
    expect(globals.version).toEqual(new Fr(CONFIG.rollupVersion));
    expect(globals.slotNumber).toEqual(3);
    expect(globals.timestamp).toEqual(CONFIG.l1GenesisTime + 3n * BigInt(CONFIG.slotDuration));
    expect(globals.coinbase).toEqual(EthAddress.ZERO);
    expect(globals.feeRecipient).toEqual(AztecAddress.ZERO);
  });

  it('takes the first prediction for the slot the window starts at', async () => {
    await expect(gasFeesAt(0)).resolves.toEqual(FEES[0]);
  });

  it('takes the matching prediction for a slot inside the window', async () => {
    await expect(gasFeesAt(1)).resolves.toEqual(FEES[1]);
    await expect(gasFeesAt(2)).resolves.toEqual(FEES[2]);
  });

  it('clamps to the last prediction for a slot beyond the window', async () => {
    await expect(gasFeesAt(3)).resolves.toEqual(FEES[FEES.length - 1]);
    await expect(gasFeesAt(50)).resolves.toEqual(FEES[FEES.length - 1]);
  });

  it('clamps to the first prediction for a slot before the window', async () => {
    // Two L2 slots into the chain, so the prediction window starts at slot 2 and slot 0 is behind it.
    advanceSlots(2);
    await expect(gasFeesAt(0)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(2)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(3)).resolves.toEqual(FEES[1]);
  });

  it('starts the window after the local checkpointed tip when it is ahead of the wall clock', async () => {
    // A checkpoint covering slot 2 is already replicated, so the upstream cannot checkpoint before slot 3.
    blockSource.getBlockData.mockResolvedValue(blockDataAtSlot(2));

    await expect(gasFeesAt(2)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(3)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(4)).resolves.toEqual(FEES[1]);
    await expect(gasFeesAt(5)).resolves.toEqual(FEES[2]);
    await expect(gasFeesAt(6)).resolves.toEqual(FEES[FEES.length - 1]);
  });

  it('ignores a local checkpointed tip that trails the wall clock', async () => {
    // The window still starts at the slot of the next L1 block, five slots in.
    advanceSlots(5);
    blockSource.getBlockData.mockResolvedValue(blockDataAtSlot(1));

    await expect(gasFeesAt(4)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(5)).resolves.toEqual(FEES[0]);
    await expect(gasFeesAt(6)).resolves.toEqual(FEES[1]);
  });

  it('reads the tip of the checkpointed chain rather than of the proposed one', async () => {
    await build(0);

    expect(blockSource.getBlockData).toHaveBeenCalledWith({ tag: 'checkpointed' });
  });

  it('fails loudly when the upstream returns no predictions', async () => {
    feeProvider.getPredictedMinFees.mockResolvedValue([]);
    await expect(build(1)).rejects.toThrow(/no min fee predictions/);
  });
});
