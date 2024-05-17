import { NestedProcessReturnValues } from '@aztec/circuit-types';
import { pedersenHash } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import type { ExecutionResult, PublicExecutionResult } from './index.js';

/**
 * Computes the resulting storage slot for an entry in a mapping.
 * @param mappingSlot - The slot of the mapping within state.
 * @param key - The key of the mapping.
 * @returns The slot in the contract storage where the value is stored.
 */
export function computeSlotForMapping(
  mappingSlot: Fr,
  key: {
    /** Serialize to a field. */
    toField: () => Fr;
  },
) {
  return pedersenHash([mappingSlot, key.toField()]);
}

/**
 * Recursively accummulate the return values of a call result and its nested executions,
 * so they can be retrieved in order.
 * @param executionResult
 * @returns
 */
export function accumulateReturnValues(
  executionResult: PublicExecutionResult | ExecutionResult,
): NestedProcessReturnValues {
  const acc = new NestedProcessReturnValues(executionResult.returnValues);
  acc.nested = executionResult.nestedExecutions.map(nestedExecution => accumulateReturnValues(nestedExecution));
  return acc;
}
