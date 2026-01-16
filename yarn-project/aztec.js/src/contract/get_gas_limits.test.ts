import { AVM_MAX_PROCESSABLE_L2_GAS } from '@aztec/constants';
import { Gas } from '@aztec/stdlib/gas';
import { mockSimulatedTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

import { getGasLimits } from './get_gas_limits.js';

describe('getGasLimits', () => {
  let txSimulationResult: TxSimulationResult;

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
    expect(getGasLimits(txSimulationResult)).toEqual({
      gasLimits: Gas.from({ daGas: 111, l2Gas: 221 }),
      teardownGasLimits: Gas.empty(),
    });
  });

  it('returns gas limits for private and public', () => {
    expect(getGasLimits(txSimulationResult)).toEqual({
      gasLimits: Gas.from({ daGas: 154, l2Gas: 308 }),
      teardownGasLimits: Gas.from({ daGas: 11, l2Gas: 22 }),
    });
  });

  it('pads gas limits', () => {
    expect(getGasLimits(txSimulationResult, 1)).toEqual({
      gasLimits: Gas.from({ daGas: 280, l2Gas: 560 }),
      teardownGasLimits: Gas.from({ daGas: 20, l2Gas: 40 }),
    });
  });

  it('should fail if gas exceeds max processable gas', () => {
    // Consumes all of processable gas
    txSimulationResult.publicOutput!.gasUsed = {
      totalGas: Gas.from({ daGas: 140, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS }),
      billedGas: Gas.from({ daGas: 150, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS }),
      teardownGas: Gas.from({ daGas: 10, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS * 0.2 }),
      publicGas: Gas.from({ daGas: 50, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS }),
    };
    // Does not fail without padding since it's at the limit
    expect(getGasLimits(txSimulationResult, 0)).toEqual({
      gasLimits: Gas.from({ daGas: 140, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS }),
      teardownGasLimits: Gas.from({ daGas: 10, l2Gas: AVM_MAX_PROCESSABLE_L2_GAS * 0.2 }),
    });
    // Fails with padding since it's over the limit
    expect(() => getGasLimits(txSimulationResult, 0.1)).toThrow(
      'Transaction consumes more gas than the AVM maximum processable gas',
    );
  });
});
