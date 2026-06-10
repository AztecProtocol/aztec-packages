import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Gas } from '@aztec/stdlib/gas';
import { mockSimulatedTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

import { getGasLimits } from './get_gas_limits.js';

describe('getGasLimits', () => {
  let txSimulationResult: TxSimulationResult;

  // A network limit comfortably above the mocked usage, so padding is never clamped.
  const maxTxGasLimits = Gas.from({ daGas: 117_668, l2Gas: 6_540_000 });

  beforeEach(async () => {
    txSimulationResult = await mockSimulatedTx();

    const tx = await mockTxForRollup();
    tx.data.gasUsed = Gas.from({ daGas: 100, l2Gas: 200 });
    txSimulationResult.publicInputs = tx.data;

    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: 140, l2Gas: 280 }),
      // Assume teardown gas limit of 20, 30
      billedGas: Gas.from({ daGas: 150, l2Gas: 290 }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: 20 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
  });

  it('returns gas limits from private gas usage only', () => {
    txSimulationResult.publicOutput = undefined;
    // Should be 110 and 220 but oh floating point
    expect(getGasLimits(txSimulationResult, maxTxGasLimits)).toEqual({
      gasLimits: Gas.from({ daGas: 111, l2Gas: 221 }),
      teardownGasLimits: Gas.empty(),
    });
  });

  it('returns gas limits for private and public', () => {
    expect(getGasLimits(txSimulationResult, maxTxGasLimits)).toEqual({
      gasLimits: Gas.from({ daGas: 154, l2Gas: 308 }),
      teardownGasLimits: Gas.from({ daGas: 11, l2Gas: 22 }),
    });
  });

  it('pads gas limits in full when below the network limit', () => {
    expect(getGasLimits(txSimulationResult, maxTxGasLimits, 1)).toEqual({
      gasLimits: Gas.from({ daGas: 280, l2Gas: 560 }),
      teardownGasLimits: Gas.from({ daGas: 20, l2Gas: 40 }),
    });
  });

  it('clamps padded gas at the network limit when usage is below it', () => {
    // Usage fits the network limit, but padding it would exceed it; the declared limit is clamped down.
    const tightLimits = Gas.from({ daGas: 145, l2Gas: 290 });
    expect(getGasLimits(txSimulationResult, tightLimits, 0.1)).toEqual({
      // 140 * 1.1 = 154 -> clamped to 145; 280 * 1.1 = 308 -> clamped to 290.
      gasLimits: Gas.from({ daGas: 145, l2Gas: 290 }),
      // Teardown is below the limit, so it pads normally.
      teardownGasLimits: Gas.from({ daGas: 11, l2Gas: 22 }),
    });
  });

  it('clamps teardown limits at the network limit', () => {
    // Total usage fits the limit, but both total and teardown padded values exceed it and get clamped.
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: 100, l2Gas: 200 }),
      billedGas: Gas.from({ daGas: 110, l2Gas: 210 }),
      teardownGas: Gas.from({ daGas: 100, l2Gas: 200 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
    const tightLimits = Gas.from({ daGas: 105, l2Gas: 210 });
    expect(getGasLimits(txSimulationResult, tightLimits, 0.1)).toEqual({
      // 100 * 1.1 = 110 clamped to 105; 200 * 1.1 = 220 clamped to 210.
      gasLimits: Gas.from({ daGas: 105, l2Gas: 210 }),
      // 100 * 1.1 = 110 clamped to 105; 200 * 1.1 = 220 clamped to 210.
      teardownGasLimits: Gas.from({ daGas: 105, l2Gas: 210 }),
    });
  });

  it('throws if simulated da gas exceeds the network admission limit', () => {
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: 150, l2Gas: 280 }),
      billedGas: Gas.from({ daGas: 160, l2Gas: 290 }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: 20 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
    const tightLimits = Gas.from({ daGas: 140, l2Gas: 6_540_000 });
    expect(() => getGasLimits(txSimulationResult, tightLimits, 0)).toThrow(
      'Transaction consumes 150 DA gas but the network only admits transactions declaring up to 140 DA gas',
    );
  });

  it('clamps caller-supplied limits above the protocol maxima down to the protocol maxima', () => {
    // A caller may pass an unclamped maxTxGasLimits above the per-tx protocol maxima; the function must
    // defensively clamp to them so the declared limits never exceed what the protocol allows.
    const aboveProtocolMaxima = Gas.from({ daGas: MAX_TX_DA_GAS * 2, l2Gas: MAX_PROCESSABLE_L2_GAS * 2 });

    // Usage above the protocol maximum is still rejected even though it is below the caller-supplied limit.
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: MAX_TX_DA_GAS + 1, l2Gas: 280 }),
      billedGas: Gas.from({ daGas: MAX_TX_DA_GAS + 11, l2Gas: 290 }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: 20 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
    expect(() => getGasLimits(txSimulationResult, aboveProtocolMaxima, 0)).toThrow(
      `Transaction consumes ${MAX_TX_DA_GAS + 1} DA gas but the network only admits transactions declaring up to ${MAX_TX_DA_GAS} DA gas`,
    );

    // Usage at the protocol maximum pads up against the protocol maximum, clamping the padded limit to it.
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: MAX_TX_DA_GAS, l2Gas: MAX_PROCESSABLE_L2_GAS }),
      billedGas: Gas.from({ daGas: MAX_TX_DA_GAS, l2Gas: MAX_PROCESSABLE_L2_GAS }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: 20 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
    const { gasLimits } = getGasLimits(txSimulationResult, aboveProtocolMaxima, 1);
    expect(gasLimits).toEqual(Gas.from({ daGas: MAX_TX_DA_GAS, l2Gas: MAX_PROCESSABLE_L2_GAS }));
  });

  it('throws if simulated l2 gas exceeds the network admission limit', () => {
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: 140, l2Gas: 300 }),
      billedGas: Gas.from({ daGas: 150, l2Gas: 310 }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: 20 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: 200 }),
    };
    const tightLimits = Gas.from({ daGas: 117_668, l2Gas: 290 });
    expect(() => getGasLimits(txSimulationResult, tightLimits, 0)).toThrow(
      'Transaction consumes 300 L2 gas but the network only admits transactions declaring up to 290 L2 gas',
    );
  });
});
