import type { Serializable, Tuple } from '@aztec/foundation/serialize';
import {
  ClaimedLengthArray,
  PrivateAccumulatedData,
  PrivateKernelCircuitPublicInputs,
  PrivateValidationRequests,
  ScopedKeyValidationRequestAndSeparator,
  ScopedPrivateLogData,
} from '@aztec/stdlib/kernel';
import type { PrivateCallExecutionResult } from '@aztec/stdlib/tx';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { PrivateKernelResetPrivateInputsBuilder } from './hints/private_kernel_reset_private_inputs_builder.js';

/**
 * Decides how many apps from the top of the execution stack the next kernel iteration should
 * absorb. The decision is made by keeping track of an app-by-app accumulator calling
 * `PrivateKernelResetPrivateInputsBuilder.needsReset()` whether a reset would be required before
 * taking each candidate.
 *
 * The K-batched kernels are mathematically equivalent to running K sequential `init`/`inner`
 * iterations so a multi-app fit-check reduces to a sequence of single-app fit-checks against a rolling
 * accumulator.
 */
export class BatchPlanner {
  constructor(
    private noteHashNullifierCounterMap: Map<number, number>,
    private splitCounter: number,
    private maxBatchSize: number,
  ) {}

  /**
   * Returns the number of apps from the top of `stack` that the next kernel iteration should
   * batch. Always at least 1 — the caller is expected to have run any pending resets first, so
   * the next single app must always fit.
   *
   * The walk mirrors `consumeNextApp`'s stack manipulation (pop top, push reversed nested
   * children, then DFS into them) on a copy of the stack, so the planner can look ahead past
   * the parent's children without mutating the real prover stack.
   */
  decideBatchSize(currentAccumulator: PrivateKernelCircuitPublicInputs, stack: PrivateCallExecutionResult[]): number {
    const virtualStack = [...stack];
    let projected = currentAccumulator;
    let chosen = 0;
    for (let i = 0; i < this.maxBatchSize && virtualStack.length > 0; i++) {
      const probe = new PrivateKernelResetPrivateInputsBuilder(
        {
          publicInputs: projected,
          verificationKey: VerificationKeyData.empty(),
          outputWitness: new Map(),
          bytecode: Buffer.from([]),
        },
        virtualStack,
        this.noteHashNullifierCounterMap,
        this.splitCounter,
      );
      if (probe.needsReset()) {
        break;
      }
      // Speculatively consume the top of the virtual stack the same way `consumeNextApp` does
      // on the real stack: pop the candidate, push its reversed nested children so the next
      // iteration's top is the next DFS app.
      const candidate = virtualStack.pop()!;
      virtualStack.push(...[...candidate.nestedExecutionResults].reverse());
      projected = appendApp(projected, candidate);
      chosen++;
    }
    return Math.max(1, chosen);
  }
}

/**
 * Returns a new `PrivateKernelCircuitPublicInputs` representing the accumulator after one kernel
 * iteration has absorbed `app`. Mirrors the kernel composer's accumulator-update step
 * (`PrivateKernelCircuitOutputComposer::scope_and_propagate_from_private_call`) for the six
 * fields that `PrivateKernelResetPrivateInputsBuilder.needsReset()` inspects:
 *
 * - `validationRequests.noteHashReadRequests`              (already scoped per app; appended as-is)
 * - `validationRequests.nullifierReadRequests`             (already scoped per app; appended as-is)
 * - `validationRequests.scopedKeyValidationRequestsAndSeparators` (scope with call's contract address)
 * - `end.noteHashes`                                       (scope)
 * - `end.nullifiers`                                       (scope)
 * - `end.privateLogs`                                      (scope)
 *
 * Other fields on `PrivateKernelCircuitPublicInputs` (constants, fee_payer, expiration_timestamp,
 * public_call_requests, l2_to_l1_msgs, contract_class_logs_hashes, etc.) are not read by
 * `needsReset()` and are carried over unchanged from `acc`.
 */
export function appendApp(
  acc: PrivateKernelCircuitPublicInputs,
  app: PrivateCallExecutionResult,
): PrivateKernelCircuitPublicInputs {
  const ca = app.publicInputs.callContext.contractAddress;
  const appPi = app.publicInputs;

  const newNoteHashReadRequests = cloneClaimedLengthArray(acc.validationRequests.noteHashReadRequests);
  pushAll(newNoteHashReadRequests, appPi.noteHashReadRequests.getActiveItems());

  const newNullifierReadRequests = cloneClaimedLengthArray(acc.validationRequests.nullifierReadRequests);
  pushAll(newNullifierReadRequests, appPi.nullifierReadRequests.getActiveItems());

  const newScopedKvrs = cloneClaimedLengthArray(acc.validationRequests.scopedKeyValidationRequestsAndSeparators);
  pushAll(
    newScopedKvrs,
    appPi.keyValidationRequestsAndSeparators
      .getActiveItems()
      .map(kvr => new ScopedKeyValidationRequestAndSeparator(kvr, ca)),
  );

  const newNoteHashes = cloneClaimedLengthArray(acc.end.noteHashes);
  pushAll(
    newNoteHashes,
    appPi.noteHashes.getActiveItems().map(nh => nh.scope(ca)),
  );

  const newNullifiers = cloneClaimedLengthArray(acc.end.nullifiers);
  pushAll(
    newNullifiers,
    appPi.nullifiers.getActiveItems().map(n => n.scope(ca)),
  );

  const newPrivateLogs = cloneClaimedLengthArray(acc.end.privateLogs);
  pushAll(
    newPrivateLogs,
    appPi.privateLogs.getActiveItems().map(pl => new ScopedPrivateLogData(pl, ca)),
  );

  const validationRequests = new PrivateValidationRequests(
    newNoteHashReadRequests,
    newNullifierReadRequests,
    newScopedKvrs,
  );

  const end = new PrivateAccumulatedData(
    newNoteHashes,
    newNullifiers,
    acc.end.l2ToL1Msgs,
    newPrivateLogs,
    acc.end.contractClassLogsHashes,
    acc.end.publicCallRequests,
    acc.end.privateCallStack,
  );

  return new PrivateKernelCircuitPublicInputs(
    acc.constants,
    acc.minRevertibleSideEffectCounter,
    validationRequests,
    end,
    acc.publicTeardownCallRequest,
    acc.feePayer,
    acc.expirationTimestamp,
    acc.isPrivateOnly,
    acc.claimedRevertibleCounter,
  );
}

function cloneClaimedLengthArray<T extends Serializable, N extends number>(
  src: ClaimedLengthArray<T, N>,
): ClaimedLengthArray<T, N> {
  return new ClaimedLengthArray([...src.array] as Tuple<T, N>, src.claimedLength);
}

function pushAll<T extends Serializable, N extends number>(arr: ClaimedLengthArray<T, N>, items: T[]) {
  for (const item of items) {
    arr.array[arr.claimedLength] = item;
    arr.claimedLength++;
  }
}
