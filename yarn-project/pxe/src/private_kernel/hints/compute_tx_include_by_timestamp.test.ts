import { MAX_INCLUDE_BY_TIMESTAMP_DURATION } from '@aztec/constants';
import { PrivateKernelCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { IncludeByTimestampOption } from '@aztec/stdlib/tx';

import { computeTxIncludeByTimestamp } from './compute_tx_include_by_timestamp.js';

describe('computeTxIncludeByTimestamp', () => {
  let previousKernel: PrivateKernelCircuitPublicInputs;

  const blockTimestamp = 99999n;
  const maxDuration = BigInt(MAX_INCLUDE_BY_TIMESTAMP_DURATION);
  const secondsInHour = 3600n;
  const secondsIn30Mins = 60n * 30n;

  const setIncludeByTimestamp = (timestamp: bigint) => {
    previousKernel.includeByTimestamp = new IncludeByTimestampOption(true, timestamp);
  };

  beforeEach(() => {
    previousKernel = PrivateKernelCircuitPublicInputs.empty();
    previousKernel.constants.historicalHeader.globalVariables.timestamp = blockTimestamp;
  });

  it('rounds down to the max allowed duration', () => {
    const maxTimestamp = blockTimestamp + maxDuration;

    setIncludeByTimestamp(maxTimestamp + 87654n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(maxTimestamp);

    setIncludeByTimestamp(maxTimestamp + 123n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(maxTimestamp);

    setIncludeByTimestamp(maxTimestamp);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(maxTimestamp);
  });

  it('rounds down to the nearest hour', () => {
    setIncludeByTimestamp(blockTimestamp + maxDuration - 1n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + maxDuration - secondsInHour);

    setIncludeByTimestamp(blockTimestamp + secondsInHour * 11n + 1n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsInHour * 11n);

    setIncludeByTimestamp(blockTimestamp + secondsInHour * 2n + 123n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsInHour * 2n);

    setIncludeByTimestamp(blockTimestamp + secondsInHour);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsInHour);
  });

  it('rounds down to 30 mins for duration between 30 mins to 1 hour', () => {
    setIncludeByTimestamp(blockTimestamp + secondsInHour - 1n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsIn30Mins);

    setIncludeByTimestamp(blockTimestamp + secondsIn30Mins + 123n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsIn30Mins);

    setIncludeByTimestamp(blockTimestamp + secondsIn30Mins);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsIn30Mins);
  });

  it('rounds down to 1 seconds for duration under 30 mins', () => {
    setIncludeByTimestamp(blockTimestamp + secondsIn30Mins - 1n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + secondsIn30Mins - 1n);

    setIncludeByTimestamp(blockTimestamp + 60n * 10n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + 60n * 10n);

    setIncludeByTimestamp(blockTimestamp + 1n);
    expect(computeTxIncludeByTimestamp(previousKernel)).toBe(blockTimestamp + 1n);
  });

  it('throws if the timestamp is equal to or less than the block timestamp', () => {
    setIncludeByTimestamp(blockTimestamp);
    expect(() => computeTxIncludeByTimestamp(previousKernel)).toThrow();

    setIncludeByTimestamp(blockTimestamp - 1n);
    expect(() => computeTxIncludeByTimestamp(previousKernel)).toThrow();
  });

  it('allows custom max duration', () => {
    const customMaxDuration = maxDuration / 2n;
    const includeByTimestamp = computeTxIncludeByTimestamp(previousKernel, Number(customMaxDuration));
    expect(includeByTimestamp).toBe(blockTimestamp + customMaxDuration);
  });

  it('throws if the custom max duration is greater than the max allowed', () => {
    const customMaxDuration = maxDuration + 1n;
    expect(() => computeTxIncludeByTimestamp(previousKernel, Number(customMaxDuration))).toThrow();
  });
});
