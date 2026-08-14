import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  NULLIFIER_TREE_HEIGHT,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { allToCompletion } from '@aztec/foundation/promise';
import { assertLength } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { privateKernelResetDimensionsConfig } from '@aztec/noir-protocol-circuits-types/client';
import {
  ClaimedLengthArray,
  KeyValidationHint,
  PaddedSideEffects,
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelResetDimensions,
  PrivateKernelResetHints,
  type PrivateKernelSimulateOutput,
  ReadRequestActionEnum,
  ReadRequestResetActions,
  type ScopedKeyValidationRequestAndSeparator,
  TransientDataSquashingHint,
  buildNoteHashReadRequestHintsFromResetActions,
  buildNullifierReadRequestHintsFromResetActions,
  buildTransientDataHints,
  countSquashedLogs,
  findPrivateKernelResetDimensions,
  getNoteHashReadRequestResetActions,
  getNullifierReadRequestResetActions,
  kernelStateIsForPublic,
  privateKernelResetDimensionNames,
} from '@aztec/stdlib/kernel';
import { type PrivateCallExecutionResult, collectNested } from '@aztec/stdlib/tx';
import { VkData } from '@aztec/stdlib/vks';

import type { PrivateKernelOracle } from '../private_kernel_oracle.js';

function getNullifierMembershipWitnessResolver(oracle: PrivateKernelOracle) {
  return async (nullifier: Fr) => {
    const res = await oracle.getNullifierMembershipWitness(nullifier);
    if (!res) {
      throw new Error(`Cannot find the leaf for nullifier ${nullifier}.`);
    }

    const { index, siblingPath, leafPreimage } = res;
    return {
      membershipWitness: new MembershipWitness(NULLIFIER_TREE_HEIGHT, index, siblingPath.toTuple()),
      leafPreimage,
    };
  };
}

async function getMasterSecretKeysAndKeyTypeDomainSeparators(
  keyValidationRequests: ClaimedLengthArray<
    ScopedKeyValidationRequestAndSeparator,
    typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX
  >,
  numRequestsToVerify: number,
  oracle: PrivateKernelOracle,
) {
  const numRequestsToProcess = Math.min(keyValidationRequests.claimedLength, numRequestsToVerify);
  const keysHints = await allToCompletion(
    keyValidationRequests.array.slice(0, numRequestsToProcess).map(async ({ request }) => {
      const secretKeys = await oracle.getMasterSecretKey(request.request.pkMHash);
      return new KeyValidationHint(secretKeys);
    }),
  );
  return padArrayEnd(keysHints, KeyValidationHint.empty(), MAX_KEY_VALIDATION_REQUESTS_PER_TX);
}

export class PrivateKernelResetPrivateInputsBuilder {
  private previousKernel: PrivateKernelCircuitPublicInputs;
  // If there's no next iteration, it's the final reset.
  private nextIteration?: PrivateCircuitPublicInputs;

  private noteHashResetActions = ReadRequestResetActions.empty(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
  private nullifierResetActions = ReadRequestResetActions.empty(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
  private numTransientData?: number;
  private transientDataSquashingHints = makeTuple(
    MAX_NULLIFIERS_PER_TX,
    () => new TransientDataSquashingHint(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX),
  );
  private requestedDimensions = PrivateKernelResetDimensions.empty();

  constructor(
    private previousKernelOutput: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>,
    private executionStack: PrivateCallExecutionResult[],
    private noteHashNullifierCounterMap: Map<number, number>,
    private splitCounter: number,
  ) {
    this.previousKernel = previousKernelOutput.publicInputs;
    this.nextIteration = executionStack[this.executionStack.length - 1]?.publicInputs;
  }

  getRequestedDimensions(): PrivateKernelResetDimensions {
    return this.requestedDimensions;
  }

  needsReset(): boolean {
    const fns: (() => boolean)[] = [
      () => this.needsResetNoteHashReadRequests(),
      () => this.needsResetNullifierReadRequests(),
      () => this.needsResetKeyValidationRequests(),
      () => this.needsResetTransientData(),
    ];

    if (this.nextIteration) {
      // If there's a next iteration, reset is needed only when data of a dimension is about to overflow.
      // fns are executed until a dimension that needs reset is found.
      return fns.some(fn => fn());
    } else {
      // Siloing is only needed after processing all iterations.
      fns.push(
        ...[() => this.needsSiloNoteHashes(), () => this.needsSiloNullifiers(), () => this.needsSiloPrivateLogs()],
      );
      // If there's no next iteration, reset is needed when any of the dimension has non empty data.
      // All the fns should to be executed so that data in all dimensions will be reset.
      const result = fns.map(fn => fn());
      return result.some(r => r);
    }
  }

  async build(oracle: PrivateKernelOracle) {
    if (privateKernelResetDimensionNames.every(name => !this.requestedDimensions[name])) {
      throw new Error('Reset is not required.');
    }

    const isInner = !!this.nextIteration;

    // "final" reset must be done exactly once, because siloing can't be run repeatedly.
    // The dimensions found must be big enough to reset all values, i.e. empty remainder.
    const allowRemainder = isInner;

    // Terminal reset picks from the finalTail / finalTailToPublic catalogs; mid-tx resets always
    // use the inner catalog. The public/private decision must match `kernelStateIsForPublic` - the
    // same predicate the circuit inputs and the orchestrator use.
    const mode = isInner
      ? ('inner' as const)
      : kernelStateIsForPublic(this.previousKernel)
        ? ('finalTailToPublic' as const)
        : ('finalTail' as const);

    const dimensions = findPrivateKernelResetDimensions(
      this.requestedDimensions,
      privateKernelResetDimensionsConfig,
      mode,
      allowRemainder,
    );

    this.reduceReadRequestActions(
      this.noteHashResetActions,
      dimensions.NOTE_HASH_PENDING_READ,
      dimensions.NOTE_HASH_SETTLED_READ,
    );
    this.reduceReadRequestActions(
      this.nullifierResetActions,
      dimensions.NULLIFIER_PENDING_READ,
      dimensions.NULLIFIER_SETTLED_READ,
    );

    // Execute all the expensive node querying operations in parallel.
    const [previousVkMembershipWitness, noteHashReadRequestHints, nullifierReadRequestHints, keyValidationHints] =
      await allToCompletion([
        oracle.getVkMembershipWitness(this.previousKernelOutput.verificationKey.keyAsFields),
        buildNoteHashReadRequestHintsFromResetActions<
          typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
          typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX
        >(
          oracle,
          this.previousKernel.validationRequests.noteHashReadRequests,
          this.previousKernel.end.noteHashes,
          this.noteHashResetActions,
        ),
        buildNullifierReadRequestHintsFromResetActions<
          typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
          typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX
        >(
          { getNullifierMembershipWitness: getNullifierMembershipWitnessResolver(oracle) },
          this.previousKernel.validationRequests.nullifierReadRequests,
          this.nullifierResetActions,
        ),
        getMasterSecretKeysAndKeyTypeDomainSeparators(
          this.previousKernel.validationRequests.scopedKeyValidationRequestsAndSeparators,
          dimensions.KEY_VALIDATION,
          oracle,
        ),
      ]);

    const vkData = new VkData(
      this.previousKernelOutput.verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      previousVkMembershipWitness.siblingPath,
    );
    const previousKernelData = new PrivateKernelData(this.previousKernelOutput.publicInputs, vkData);

    // TODO: Enable padding when we have a better idea what are the final amounts we should pad to.
    const paddedSideEffects = PaddedSideEffects.empty();

    return new PrivateKernelResetCircuitPrivateInputs(
      previousKernelData,
      paddedSideEffects,
      new PrivateKernelResetHints(
        noteHashReadRequestHints,
        nullifierReadRequestHints,
        keyValidationHints,
        this.transientDataSquashingHints,
      ),
      dimensions,
    );
  }

  private reduceReadRequestActions<NUM_READS extends number>(
    resetActions: ReadRequestResetActions<NUM_READS>,
    maxPending: number,
    maxSettled: number,
  ) {
    let numPending = 0;
    let numSettled = 0;
    for (let i = 0; i < resetActions.actions.length; i++) {
      const action = resetActions.actions[i];
      if (action === ReadRequestActionEnum.READ_AS_PENDING) {
        if (numPending < maxPending) {
          numPending++;
        } else {
          resetActions.actions[i] = ReadRequestActionEnum.SKIP;
        }
      } else if (action === ReadRequestActionEnum.READ_AS_SETTLED) {
        if (numSettled < maxSettled) {
          numSettled++;
        } else {
          resetActions.actions[i] = ReadRequestActionEnum.SKIP;
        }
      }
    }

    resetActions.pendingReadHints = resetActions.pendingReadHints.slice(0, maxPending);
  }

  private needsResetNoteHashReadRequests(forceReset = false) {
    const numCurr = this.previousKernel.validationRequests.noteHashReadRequests.claimedLength;
    const numNext = this.nextIteration ? this.nextIteration.noteHashReadRequests.claimedLength : 0;
    const maxAmountToKeep = !this.nextIteration || forceReset ? 0 : MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const resetActions = getNoteHashReadRequestResetActions(
      this.previousKernel.validationRequests.noteHashReadRequests,
      this.previousKernel.end.noteHashes,
    );

    const numPendingReads = resetActions.pendingReadHints.length;
    const numSettledReads = resetActions.actions.reduce(
      (accum, action) => accum + (action === ReadRequestActionEnum.READ_AS_SETTLED ? 1 : 0),
      0,
    );

    const totalReadsToReset = numPendingReads + numSettledReads;
    const minResetNeeded = numCurr + numNext - maxAmountToKeep;
    if (totalReadsToReset < minResetNeeded) {
      if (!this.nextIteration) {
        // In the final reset, all note hashes have been emitted. So if we can't reset all requests, at least one
        // pending read request doesn't match any of them.
        throw new Error('No matching note hash found for note hash read request.');
      } else if (!forceReset) {
        // A pending read request can only be reset if its note hash has already been included (e.g. a parent call might
        // be reading a note hash emitted by a child call. The read request of the parent call is included before the note
        // hash of the child call).
        // If we can't clear enough read requests to make room for the next iteration's reads, we're stuck.
        throw new Error('Number of note hash read requests exceeds the limit.');
      } else if (totalReadsToReset == 0) {
        // It's transient data squashing asking for the read requests to be reset first (forceReset == true), and
        // there's nothing to reset, returns false and let needsResetTransientData throw a more descriptive error.
        return false;
      }
      // Otherwise, forceReset is true, we should proceed to reset as many as we can.
    }

    if (!this.nextIteration) {
      // If there's no next iteration, we need to reset all the read requests.
      this.noteHashResetActions = resetActions;
      this.requestedDimensions.NOTE_HASH_PENDING_READ = numPendingReads;
      this.requestedDimensions.NOTE_HASH_SETTLED_READ = numSettledReads;
    } else {
      // If there's a next iteration, only one dimension can be reset at a time.
      // So we pick the dimension that has more read requests to reset.
      if (numPendingReads > numSettledReads) {
        // Reset the pending read requests.
        const pendingOnlyActions = assertLength(
          resetActions.actions.map(action =>
            action === ReadRequestActionEnum.READ_AS_PENDING ? action : ReadRequestActionEnum.SKIP,
          ),
          MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        );
        this.noteHashResetActions = new ReadRequestResetActions(pendingOnlyActions, resetActions.pendingReadHints);
        this.requestedDimensions.NOTE_HASH_PENDING_READ = numPendingReads;
      } else {
        // Reset the settled read requests.
        const settledOnlyActions = assertLength(
          resetActions.actions.map(action =>
            action === ReadRequestActionEnum.READ_AS_SETTLED ? action : ReadRequestActionEnum.SKIP,
          ),
          MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        );
        this.noteHashResetActions = new ReadRequestResetActions(settledOnlyActions, []);
        this.requestedDimensions.NOTE_HASH_SETTLED_READ = numSettledReads;
      }
    }

    return true;
  }

  private needsResetNullifierReadRequests(forceReset = false) {
    const numCurr = this.previousKernel.validationRequests.nullifierReadRequests.claimedLength;
    const numNext = this.nextIteration ? this.nextIteration.nullifierReadRequests.claimedLength : 0;
    const maxAmountToKeep = !this.nextIteration || forceReset ? 0 : MAX_NULLIFIER_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const resetActions = getNullifierReadRequestResetActions(
      this.previousKernel.validationRequests.nullifierReadRequests,
      this.previousKernel.end.nullifiers,
    );

    const numPendingReads = resetActions.pendingReadHints.length;
    const numSettledReads = resetActions.actions.reduce(
      (accum, action) => accum + (action === ReadRequestActionEnum.READ_AS_SETTLED ? 1 : 0),
      0,
    );

    const totalReadsToReset = numPendingReads + numSettledReads;
    const minResetNeeded = numCurr + numNext - maxAmountToKeep;
    if (totalReadsToReset < minResetNeeded) {
      if (!this.nextIteration) {
        // In the final reset, all nullifiers have been emitted. So if we can't reset all requests, at least one pending
        // read request doesn't match any of them.
        throw new Error('No matching nullifier found for nullifier read request.');
      } else if (!forceReset) {
        // A pending read request can only be reset if its nullifier has already been included (e.g. a parent call might
        // be reading a nullifier emitted by a child call. The read request of the parent call is included before the
        // nullifier of the child call).
        // If we can't clear enough read requests to make room for the next iteration's reads, we're stuck.
        throw new Error('Number of nullifier read requests exceeds the limit.');
      } else if (totalReadsToReset == 0) {
        // It's transient data squashing asking for the read requests to be reset first (forceReset == true), and
        // there's nothing to reset, returns false and let needsResetTransientData throw a more descriptive error.
        return false;
      }
      // Otherwise, forceReset is true, we should proceed to reset as many as we can.
    }

    if (!this.nextIteration) {
      // If there's no next iteration, we need to reset all the read requests.
      this.nullifierResetActions = resetActions;
      this.requestedDimensions.NULLIFIER_PENDING_READ = numPendingReads;
      this.requestedDimensions.NULLIFIER_SETTLED_READ = numSettledReads;
    } else {
      // If there's a next iteration, we can only reset one dimension at a time.
      if (numPendingReads > numSettledReads) {
        // Reset the pending read requests.
        const pendingOnlyActions = assertLength(
          resetActions.actions.map(action =>
            action === ReadRequestActionEnum.READ_AS_PENDING ? action : ReadRequestActionEnum.SKIP,
          ),
          MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        );
        this.nullifierResetActions = new ReadRequestResetActions(pendingOnlyActions, resetActions.pendingReadHints);
        this.requestedDimensions.NULLIFIER_PENDING_READ = numPendingReads;
      } else {
        // Reset the settled read requests.
        const settledOnlyActions = assertLength(
          resetActions.actions.map(action =>
            action === ReadRequestActionEnum.READ_AS_SETTLED ? action : ReadRequestActionEnum.SKIP,
          ),
          MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        );
        this.nullifierResetActions = new ReadRequestResetActions(settledOnlyActions, []);
        this.requestedDimensions.NULLIFIER_SETTLED_READ = numSettledReads;
      }
    }

    return true;
  }

  private needsResetKeyValidationRequests() {
    const numCurr = this.previousKernel.validationRequests.scopedKeyValidationRequestsAndSeparators.claimedLength;
    const numNext = this.nextIteration ? this.nextIteration.keyValidationRequestsAndSeparators.claimedLength : 0;
    const maxAmountToKeep = !this.nextIteration ? 0 : MAX_KEY_VALIDATION_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    this.requestedDimensions.KEY_VALIDATION = numCurr;

    return true;
  }

  private needsResetTransientData() {
    const nextAccumNoteHashes =
      this.previousKernel.end.noteHashes.claimedLength + (this.nextIteration?.noteHashes.claimedLength ?? 0);
    const noteHashWillOverflow = nextAccumNoteHashes > MAX_NOTE_HASHES_PER_TX;
    const nextAccumNullifiers =
      this.previousKernel.end.nullifiers.claimedLength + (this.nextIteration?.nullifiers.claimedLength ?? 0);
    const nullifierWillOverflow = nextAccumNullifiers > MAX_NULLIFIERS_PER_TX;
    const nextAccumLogs =
      this.previousKernel.end.privateLogs.claimedLength + (this.nextIteration?.privateLogs.claimedLength ?? 0);
    const logsWillOverflow = nextAccumLogs > MAX_PRIVATE_LOGS_PER_TX;

    if (this.nextIteration && !noteHashWillOverflow && !nullifierWillOverflow && !logsWillOverflow) {
      return false;
    }

    const futureNoteHashReads = collectNested(this.executionStack, executionResult =>
      executionResult.publicInputs.noteHashReadRequests.getActiveItems(),
    );
    const futureNullifierReads = collectNested(this.executionStack, executionResult =>
      executionResult.publicInputs.nullifierReadRequests.getActiveItems(),
    );
    const futureLogs = collectNested(this.executionStack, executionResult =>
      executionResult.publicInputs.privateLogs.getActiveItems(),
    );
    if (this.nextIteration) {
      // If it's not the final reset, only one dimension will be reset at a time. Since we are resetting the transient
      // data, the note hash and nullifier read requests in the previous kernel won't be squashed and need to be
      // included in the future read requests.
      futureNoteHashReads.push(...this.previousKernel.validationRequests.noteHashReadRequests.getActiveItems());
      futureNullifierReads.push(...this.previousKernel.validationRequests.nullifierReadRequests.getActiveItems());
    }

    const { numTransientData, hints: transientDataSquashingHints } = buildTransientDataHints(
      this.previousKernel.end.noteHashes,
      this.previousKernel.end.nullifiers,
      futureNoteHashReads,
      futureNullifierReads,
      futureLogs,
      this.noteHashNullifierCounterMap,
      this.splitCounter,
    );

    if (this.nextIteration) {
      const noteHashOverflowBy = noteHashWillOverflow
        ? nextAccumNoteHashes - MAX_NOTE_HASHES_PER_TX - numTransientData
        : 0;
      const nullifierOverflowBy = nullifierWillOverflow
        ? nextAccumNullifiers - MAX_NULLIFIERS_PER_TX - numTransientData
        : 0;
      const numSquashedLogs = logsWillOverflow
        ? countSquashedLogs(
            this.previousKernel.end.noteHashes,
            this.previousKernel.end.privateLogs,
            transientDataSquashingHints.slice(0, numTransientData),
          )
        : 0;
      const logsOverflowBy = logsWillOverflow ? nextAccumLogs - MAX_PRIVATE_LOGS_PER_TX - numSquashedLogs : 0;

      if (noteHashOverflowBy > 0 || nullifierOverflowBy > 0 || logsOverflowBy > 0) {
        // There's not enough transient data to squash to clear space for the overflow. It may be because some data is
        // still required for read requests. Force a reset of the read requests first, and return to transient data
        // squashing in the next round of reset.
        // Note that clearing the read requests might not be enough to clear more space for the overflow. In this case,
        // running the next reset will fail at the following check.
        // Only one dimension can be reset at a time for an inner reset, so we try the note hash read requests first
        // (which also helps with log overflow), then fall back to nullifier read requests.
        const forceReset = true;
        if ((noteHashOverflowBy > 0 || logsOverflowBy > 0) && this.needsResetNoteHashReadRequests(forceReset)) {
          return true;
        }
        if (nullifierOverflowBy > 0 && this.needsResetNullifierReadRequests(forceReset)) {
          return true;
        }
        if (noteHashWillOverflow) {
          throw new Error('Number of note hashes exceeds the limit.');
        }
        if (nullifierWillOverflow) {
          throw new Error('Number of nullifiers exceeds the limit.');
        }
        throw new Error('Number of private logs exceeds the limit.');
      }
    }

    this.numTransientData = numTransientData;
    this.transientDataSquashingHints = transientDataSquashingHints;
    this.requestedDimensions.TRANSIENT_DATA_SQUASHING = numTransientData;

    return numTransientData > 0;
  }

  private needsSiloNoteHashes() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNoteHashes`.');
    }

    const noteHashes = this.previousKernel.end.noteHashes;
    if (noteHashes.claimedLength > 0 && noteHashes.array[0].contractAddress.isZero()) {
      // Already siloed.
      return false;
    }

    const numToSilo = noteHashes.claimedLength - this.numTransientData;
    this.requestedDimensions.NOTE_HASH_SILOING = numToSilo;

    return numToSilo > 0;
  }

  private needsSiloNullifiers() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNullifiers`.');
    }

    const nullifiers = this.previousKernel.end.nullifiers;
    if (nullifiers.claimedLength > 0 && nullifiers.array[0].contractAddress.isZero()) {
      // Already siloed.
      return false;
    }

    const numToSilo = nullifiers.claimedLength - this.numTransientData;
    this.requestedDimensions.NULLIFIER_SILOING = numToSilo;

    return numToSilo > 0;
  }

  private needsSiloPrivateLogs() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloPrivateLogs`.');
    }

    const privateLogs = this.previousKernel.end.privateLogs;
    if (privateLogs.claimedLength > 0 && privateLogs.array[0].contractAddress.isZero()) {
      // Already siloed.
      return false;
    }

    const numSquashedLogs = countSquashedLogs(
      this.previousKernel.end.noteHashes,
      privateLogs,
      this.transientDataSquashingHints.slice(0, this.numTransientData),
    );
    const numToSilo = privateLogs.claimedLength - numSquashedLogs;
    this.requestedDimensions.PRIVATE_LOG_SILOING = numToSilo;

    return numToSilo > 0;
  }
}
