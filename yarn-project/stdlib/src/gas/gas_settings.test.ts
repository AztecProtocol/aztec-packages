import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';

import { Gas } from './gas.js';
import { GasFees } from './gas_fees.js';
import { GasSettings } from './gas_settings.js';

describe('GasSettings.fallback', () => {
  const maxFeesPerGas = new GasFees(10, 10);

  it('uses the gas limits supplied by the caller', () => {
    const gasLimits = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);
    const settings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
    expect(settings.gasLimits.daGas).toBe(gasLimits.daGas);
    expect(settings.gasLimits.l2Gas).toBe(gasLimits.l2Gas);
  });

  it('keeps default teardown limits at or below the total limits', () => {
    const gasLimits = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);
    const settings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
    expect(settings.teardownGasLimits.daGas).toBeLessThanOrEqual(settings.gasLimits.daGas);
    expect(settings.teardownGasLimits.l2Gas).toBeLessThanOrEqual(settings.gasLimits.l2Gas);
  });

  it('derives teardown from explicit gas limits so teardown never exceeds the total', () => {
    // A small total (e.g. a network with many blocks per checkpoint) must still produce a valid teardown.
    const gasLimits = new Gas(100, 800);
    const settings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
    expect(settings.teardownGasLimits.daGas).toBeLessThanOrEqual(gasLimits.daGas);
    expect(settings.teardownGasLimits.l2Gas).toBeLessThanOrEqual(gasLimits.l2Gas);
  });
});
