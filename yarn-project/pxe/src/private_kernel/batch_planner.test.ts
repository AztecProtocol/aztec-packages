import {
  MAX_APPS_PER_KERNEL,
  MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
} from '@aztec/constants';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PrivateCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { PrivateCallExecutionResult } from '@aztec/stdlib/tx';

import times from 'lodash.times';

import { BatchPlanner } from './batch_planner.js';
import { PrivateCircuitPublicInputsBuilder, PrivateKernelCircuitPublicInputsBuilder } from './hints/test_utils.js';

const contractAddress = AztecAddress.fromBigIntUnsafe(987654n);

/**
 * Wraps a `PrivateCircuitPublicInputs` in a `PrivateCallExecutionResult` with the given children.
 * Only `publicInputs` and `nestedExecutionResults` are read by `BatchPlanner` / `appendApp`; the
 * other fields are filled with empty defaults.
 */
function makeApp(publicInputs: PrivateCircuitPublicInputs, children: PrivateCallExecutionResult[] = []) {
  return new PrivateCallExecutionResult(
    Buffer.alloc(0),
    Buffer.alloc(0),
    new Map(),
    publicInputs,
    [],
    new Map(),
    [],
    [],
    [],
    children,
    [],
  );
}

/** Builds an app whose publicInputs contains `numKvrs` key validation requests. */
function appWithKvrs(numKvrs: number, children: PrivateCallExecutionResult[] = []) {
  const b = new PrivateCircuitPublicInputsBuilder(contractAddress);
  times(numKvrs, () => b.addKeyValidationRequest());
  return makeApp(b.build(), children);
}

/** Builds an empty accumulator (no side effects) suitable for the start of a private flow. */
function emptyAccumulator() {
  return new PrivateKernelCircuitPublicInputsBuilder(contractAddress).build();
}

/** Builds an accumulator pre-loaded with `numKvrs` scoped key validation requests. */
function accumulatorWithKvrs(numKvrs: number) {
  const b = new PrivateKernelCircuitPublicInputsBuilder(contractAddress);
  times(numKvrs, () => b.addKeyValidationRequest());
  return b.build();
}

describe('BatchPlanner', () => {
  it('returns at least 1 even when the stack is empty', () => {
    // The orchestrator gates the call with `while (executionStack.length)` so this case never
    // fires in production, but the floor makes the function robust to misuse.
    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    expect(planner.decideBatchSize(emptyAccumulator(), [])).toBe(1);
  });

  it('returns 1 for a single app with no children', () => {
    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    const stack = [appWithKvrs(0)];
    expect(planner.decideBatchSize(emptyAccumulator(), stack)).toBe(1);
  });

  it('caps the batch at MAX_APPS_PER_KERNEL when more apps would fit', () => {
    // MAX_APPS_PER_KERNEL + 1 apps available, none overflowing — planner must stop at the cap.
    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    const stack = times(MAX_APPS_PER_KERNEL + 1, () => appWithKvrs(0));
    expect(planner.decideBatchSize(emptyAccumulator(), stack)).toBe(MAX_APPS_PER_KERNEL);
  });

  it('walks nested children via DFS expansion of the virtual stack', () => {
    // Build a chain of MAX_APPS_PER_KERNEL + 1 nested apps so the planner has to reach past the
    // entrypoint by walking children. Nothing overflows, so it picks exactly MAX_APPS_PER_KERNEL.
    let app = appWithKvrs(0);
    for (let i = 0; i < MAX_APPS_PER_KERNEL; i++) {
      app = appWithKvrs(0, [app]);
    }

    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    expect(planner.decideBatchSize(emptyAccumulator(), [app])).toBe(MAX_APPS_PER_KERNEL);
  });

  it('forces batch=1 when the first app would overflow the projected accumulator', () => {
    // Accumulator already at MAX KVRs; the first app adds one more → projected total exceeds MAX
    // before consumption, so the probe trips and the planner falls back to the floor.
    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    const stack = [appWithKvrs(1)];
    expect(planner.decideBatchSize(accumulatorWithKvrs(MAX_KEY_VALIDATION_REQUESTS_PER_TX), stack)).toBe(1);
  });

  it('stops mid-batch when the next app would overflow but earlier ones fit', () => {
    // Pre-load the accumulator so that exactly (MAX_APPS_PER_KERNEL - 1) per-call-full apps fit
    // and the MAX_APPS_PER_KERNEL-th would push it over MAX_KVR_PER_TX.
    const perApp = MAX_KEY_VALIDATION_REQUESTS_PER_CALL;
    const seeded = MAX_KEY_VALIDATION_REQUESTS_PER_TX - (MAX_APPS_PER_KERNEL - 1) * perApp;
    // Stack pop order is LIFO, and all apps are interchangeable here, so insertion order is
    // irrelevant — every entry contributes the same per-call full quota.
    const stack = times(MAX_APPS_PER_KERNEL, () => appWithKvrs(perApp));
    const planner = new BatchPlanner(new Map(), 0, MAX_APPS_PER_KERNEL);
    expect(planner.decideBatchSize(accumulatorWithKvrs(seeded), stack)).toBe(MAX_APPS_PER_KERNEL - 1);
  });

  it('honours a maxBatchSize lower than MAX_APPS_PER_KERNEL passed by the caller', () => {
    // Demonstrates that the planner is parameterised on the constructor argument and not on the
    // protocol constant — necessary for tests that need single-app dispatch.
    const planner = new BatchPlanner(new Map(), 0, 1);
    const stack = times(MAX_APPS_PER_KERNEL, () => appWithKvrs(0));
    expect(planner.decideBatchSize(emptyAccumulator(), stack)).toBe(1);
  });
});
