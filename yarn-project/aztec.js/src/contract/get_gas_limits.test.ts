import { PublicKernelPhase, type TxSimulationResult, mockSimulatedTx } from '@aztec/circuit-types';
import { Gas, type PartialPrivateTailPublicInputsForPublic } from '@aztec/circuits.js';

import { getGasLimits } from './get_gas_limits.js';

describe('getGasLimits', () => {
  let txSimulationResult: TxSimulationResult;
  let simulationTeardownGasLimits: Gas;

  beforeEach(() => {
    txSimulationResult = mockSimulatedTx();

    const data = txSimulationResult.publicInputs.forPublic?.end as any;
    data.gasUsed = Gas.from({ daGas: 100, l2Gas: 200 });
    (txSimulationResult.publicInputs.forPublic as PartialPrivateTailPublicInputsForPublic).end = data;
    txSimulationResult.publicOutput!.gasUsed = {
      [PublicKernelPhase.SETUP]: Gas.from({ daGas: 10, l2Gas: 20 }),
      [PublicKernelPhase.APP_LOGIC]: Gas.from({ daGas: 20, l2Gas: 40 }),
      [PublicKernelPhase.TEARDOWN]: Gas.from({ daGas: 10, l2Gas: 20 }),
    };
    simulationTeardownGasLimits = Gas.empty();
  });

  it('returns gas limits from private gas usage only', () => {
    txSimulationResult.publicOutput = undefined;
    // Should be 110 and 220 but oh floating point
    expect(getGasLimits(txSimulationResult, simulationTeardownGasLimits)).toEqual({
      totalGas: Gas.from({ daGas: 111, l2Gas: 221 }),
      teardownGas: Gas.empty(),
    });
  });

  it('returns gas limits for private and public', () => {
    expect(getGasLimits(txSimulationResult, simulationTeardownGasLimits)).toEqual({
      totalGas: Gas.from({ daGas: 154, l2Gas: 308 }),
      teardownGas: Gas.from({ daGas: 11, l2Gas: 22 }),
    });
  });

  it('pads gas limits', () => {
    expect(getGasLimits(txSimulationResult, simulationTeardownGasLimits, 1)).toEqual({
      totalGas: Gas.from({ daGas: 280, l2Gas: 560 }),
      teardownGas: Gas.from({ daGas: 20, l2Gas: 40 }),
    });
  });

  it('subtracts input teardown gas limits', () => {
    simulationTeardownGasLimits = Gas.from({ daGas: 80, l2Gas: 200 });
    expect(getGasLimits(txSimulationResult, simulationTeardownGasLimits)).toEqual({
      totalGas: Gas.from({ daGas: 66, l2Gas: 88 }),
      teardownGas: Gas.from({ daGas: 11, l2Gas: 22 }),
    });
  });
});
