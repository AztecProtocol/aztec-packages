import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import { beforeEach, describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { UpstreamGlobalVariableBuilder } from './upstream_global_variable_builder.js';

const CONFIG = {
  l1ChainId: 31337,
  rollupVersion: 7,
  slotDuration: 24,
  l1GenesisTime: 1_700_000_000n,
  ethereumSlotDuration: 12,
};

/** Current min fee followed by one prediction per slot of the fee oracle window. */
const FEES = [new GasFees(0, 100n), new GasFees(0, 110n), new GasFees(0, 120n)];

describe('UpstreamGlobalVariableBuilder', () => {
  let feeProvider: MockProxy<FeeProvider>;
  let dateProvider: ManualDateProvider;
  let builder: UpstreamGlobalVariableBuilder;

  beforeEach(() => {
    feeProvider = mock<FeeProvider>();
    feeProvider.getPredictedMinFees.mockResolvedValue(FEES);
    // At genesis the next L1 block lands 12s in, which still falls in L2 slot 0: the window starts at slot 0.
    dateProvider = new ManualDateProvider(Number(CONFIG.l1GenesisTime) * 1000);
    builder = new UpstreamGlobalVariableBuilder(feeProvider, dateProvider, CONFIG);
  });

  const build = (slot: number) =>
    builder.buildCheckpointGlobalVariables(EthAddress.ZERO, AztecAddress.ZERO, SlotNumber(slot));

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
    await expect(build(0).then(g => g.gasFees)).resolves.toEqual(FEES[1]);
  });

  it('takes the matching prediction for a slot inside the window', async () => {
    await expect(build(1).then(g => g.gasFees)).resolves.toEqual(FEES[2]);
  });

  it('clamps to the last prediction for a slot beyond the window', async () => {
    await expect(build(50).then(g => g.gasFees)).resolves.toEqual(FEES[FEES.length - 1]);
  });

  it('clamps to the first prediction for a slot before the window', async () => {
    // Two L2 slots into the chain, so the prediction window starts at slot 2 and slot 0 is behind it.
    dateProvider.advanceTime(2 * CONFIG.slotDuration);
    await expect(build(0).then(g => g.gasFees)).resolves.toEqual(FEES[1]);
  });

  it('fails loudly when the upstream returns no predictions', async () => {
    feeProvider.getPredictedMinFees.mockResolvedValue([]);
    await expect(build(1)).rejects.toThrow(/no min fee predictions/);
  });
});
