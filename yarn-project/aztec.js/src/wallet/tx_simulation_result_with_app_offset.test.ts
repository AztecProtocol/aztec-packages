import { Fr } from '@aztec/foundation/curves/bn254';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { NestedProcessReturnValues, PrivateExecutionResult } from '@aztec/stdlib/tx';

import { TxSimulationResultWithAppOffset } from './tx_simulation_result_with_app_offset.js';

/**
 * Builds a NestedProcessReturnValues tree that mimics what the private kernel produces.
 *
 * The structure reflects the flattened call order:
 *   index 0 = entrypoint (root), tag Fr(0)
 *   index 1..feeCallCount = fee calls, tags Fr(100), Fr(101), ...
 *   index feeCallCount+1.. = app calls, tags Fr(200), Fr(201), ...
 */
function buildReturnValues(feeCallCount: number, appCallCount: number): NestedProcessReturnValues {
  const makeLeaf = (tag: number) => new NestedProcessReturnValues([new Fr(tag)]);
  const nested = [
    ...Array.from({ length: feeCallCount }, (_, i) => makeLeaf(100 + i)),
    ...Array.from({ length: appCallCount }, (_, i) => makeLeaf(200 + i)),
  ];
  return new NestedProcessReturnValues([new Fr(0)], nested);
}

/** Subclass that injects a controlled return values tree, using real helpers for all other fields. */
class TestResult extends TxSimulationResultWithAppOffset {
  private constructor(
    privateExecutionResult: PrivateExecutionResult,
    appCallOffset: number | undefined,
    private returnValues: NestedProcessReturnValues,
  ) {
    super(privateExecutionResult, PrivateKernelTailCircuitPublicInputs.empty(), undefined, undefined, appCallOffset);
  }

  static async create(appCallOffset: number | undefined, returnValues: NestedProcessReturnValues) {
    const executionResult = await PrivateExecutionResult.random();
    return new TestResult(executionResult, appCallOffset, returnValues);
  }

  override getPrivateReturnValues() {
    return this.returnValues;
  }
}

describe('TxSimulationResultWithAppOffset.getPrivateReturnValuesOfAppCall', () => {
  describe('with appCallOffset defined', () => {
    it('offset=0 returns root values for appCallIndex=0', async () => {
      const result = await TestResult.create(0, buildReturnValues(0, 1));
      expect(result.getPrivateReturnValuesOfAppCall(0)?.values?.[0]).toEqual(new Fr(0));
    });

    it('offset=1 (entrypoint, no fee calls) returns correct app calls', async () => {
      const result = await TestResult.create(1, buildReturnValues(0, 2));
      expect(result.getPrivateReturnValuesOfAppCall(0)?.values?.[0]).toEqual(new Fr(200));
      expect(result.getPrivateReturnValuesOfAppCall(1)?.values?.[0]).toEqual(new Fr(201));
    });

    it('offset=2 (entrypoint + one fee call) skips fee call and returns app calls', async () => {
      const result = await TestResult.create(2, buildReturnValues(1, 2));
      expect(result.getPrivateReturnValuesOfAppCall(0)?.values?.[0]).toEqual(new Fr(200));
      expect(result.getPrivateReturnValuesOfAppCall(1)?.values?.[0]).toEqual(new Fr(201));
    });
  });

  describe('with appCallOffset undefined (heuristic fallback)', () => {
    it('returns nested[appCallIndex] when nested calls exist (app wrapped in entrypoint)', async () => {
      const result = await TestResult.create(undefined, buildReturnValues(0, 2));
      expect(result.getPrivateReturnValuesOfAppCall(0)?.values?.[0]).toEqual(new Fr(200));
      expect(result.getPrivateReturnValuesOfAppCall(1)?.values?.[0]).toEqual(new Fr(201));
    });

    it('returns root values when there are no nested calls (direct/NO_FROM call)', async () => {
      const result = await TestResult.create(undefined, new NestedProcessReturnValues([new Fr(42)]));
      expect(result.getPrivateReturnValuesOfAppCall(0)?.values?.[0]).toEqual(new Fr(42));
    });
  });
});
