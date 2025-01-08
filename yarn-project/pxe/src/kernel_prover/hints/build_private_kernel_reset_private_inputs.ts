import { type PrivateExecutionResult, type PrivateKernelSimulateOutput, collectNested } from '@aztec/circuit-types';
import {
  type Fr,
  KeyValidationHint,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MembershipWitness,
  NULLIFIER_TREE_HEIGHT,
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelResetDimensions,
  PrivateKernelResetHints,
  type ReadRequest,
  ReadRequestResetStates,
  ReadRequestState,
  type ScopedKeyValidationRequestAndGenerator,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedReadRequest,
  TransientDataIndexHint,
  VK_TREE_HEIGHT,
  buildNoteHashReadRequestHintsFromResetStates,
  buildNullifierReadRequestHintsFromResetStates,
  buildTransientDataHints,
  countAccumulatedItems,
  findPrivateKernelResetDimensions,
  getNonEmptyItems,
  getNoteHashReadRequestResetStates,
  getNullifierReadRequestResetStates,
  privateKernelResetDimensionNames,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import { privateKernelResetDimensionsConfig } from '@aztec/noir-protocol-circuits-types/client/lazy';

import { type ProvingDataOracle } from '../proving_data_oracle.js';

function collectNestedReadRequests(
  executionStack: PrivateExecutionResult[],
  extractReadRequests: (execution: PrivateExecutionResult) => ReadRequest[],
): ScopedReadRequest[] {
  return collectNested(executionStack, executionResult => {
    const nonEmptyReadRequests = getNonEmptyItems(extractReadRequests(executionResult));
    return nonEmptyReadRequests.map(
      readRequest => new ScopedReadRequest(readRequest, executionResult.publicInputs.callContext.contractAddress),
    );
  });
}

function getNullifierMembershipWitnessResolver(oracle: ProvingDataOracle) {
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

async function getMasterSecretKeysAndAppKeyGenerators(
  keyValidationRequests: Tuple<ScopedKeyValidationRequestAndGenerator, typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
  oracle: ProvingDataOracle,
) {
  const keysHints = [];
  for (let i = 0; i < keyValidationRequests.length; ++i) {
    const request = keyValidationRequests[i].request;
    if (request.isEmpty()) {
      break;
    }
    const secretKeys = await oracle.getMasterSecretKey(request.request.pkM);
    keysHints.push(new KeyValidationHint(secretKeys, i));
  }
  return padArrayEnd(
    keysHints,
    KeyValidationHint.nada(MAX_KEY_VALIDATION_REQUESTS_PER_TX),
    MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  );
}

export class PrivateKernelResetPrivateInputsBuilder {
  private previousKernel: PrivateKernelCircuitPublicInputs;
  // If there's no next iteration, it's the final reset.
  private nextIteration?: PrivateCircuitPublicInputs;

  private noteHashResetStates: ReadRequestResetStates<typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>;
  private nullifierResetStates: ReadRequestResetStates<typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>;
  private numTransientData?: number;
  private transientDataIndexHints: Tuple<TransientDataIndexHint, typeof MAX_NULLIFIERS_PER_TX>;
  private requestedDimensions: PrivateKernelResetDimensions;

  constructor(
    private previousKernelOutput: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>,
    private executionStack: PrivateExecutionResult[],
    private noteHashNullifierCounterMap: Map<number, number>,
    private validationRequestsSplitCounter: number,
  ) {
    this.previousKernel = previousKernelOutput.publicInputs;
    this.requestedDimensions = PrivateKernelResetDimensions.empty();
    this.noteHashResetStates = ReadRequestResetStates.empty(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    this.nullifierResetStates = ReadRequestResetStates.empty(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
    this.transientDataIndexHints = makeTuple(
      MAX_NULLIFIERS_PER_TX,
      () => new TransientDataIndexHint(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX),
    );
    this.nextIteration = executionStack[this.executionStack.length - 1]?.publicInputs;
  }

  needsReset(): boolean {
    const fns: (() => boolean)[] = [
      () => this.needsResetNoteHashReadRequests(),
      () => this.needsResetNullifierReadRequests(),
      () => this.needsResetNullifierKeys(),
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

  async build(oracle: ProvingDataOracle, noteHashLeafIndexMap: Map<bigint, bigint>) {
    if (privateKernelResetDimensionNames.every(name => !this.requestedDimensions[name])) {
      throw new Error('Reset is not required.');
    }

    const isInner = !!this.nextIteration;

    // "final" reset must be done at most once.
    // Because the code that silo note hashes can't be run repeatedly.
    // The dimensions found must be big enough to reset all values, i.e. empty remainder.
    const allowRemainder = isInner;

    const dimensions = findPrivateKernelResetDimensions(
      this.requestedDimensions,
      privateKernelResetDimensionsConfig,
      isInner,
      allowRemainder,
    );

    const previousVkMembershipWitness = await oracle.getVkMembershipWitness(this.previousKernelOutput.verificationKey);
    const previousKernelData = new PrivateKernelData(
      this.previousKernelOutput.publicInputs,
      this.previousKernelOutput.verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      assertLength<Fr, typeof VK_TREE_HEIGHT>(previousVkMembershipWitness.siblingPath, VK_TREE_HEIGHT),
    );

    this.reduceReadRequestStates(
      this.noteHashResetStates,
      dimensions.NOTE_HASH_PENDING_AMOUNT,
      dimensions.NOTE_HASH_SETTLED_AMOUNT,
    );
    this.reduceReadRequestStates(
      this.nullifierResetStates,
      dimensions.NULLIFIER_PENDING_AMOUNT,
      dimensions.NULLIFIER_SETTLED_AMOUNT,
    );

    return new PrivateKernelResetCircuitPrivateInputs(
      previousKernelData,
      new PrivateKernelResetHints(
        await buildNoteHashReadRequestHintsFromResetStates(
          oracle,
          this.previousKernel.validationRequests.noteHashReadRequests,
          this.previousKernel.end.noteHashes,
          this.noteHashResetStates,
          noteHashLeafIndexMap,
        ),
        await buildNullifierReadRequestHintsFromResetStates(
          { getNullifierMembershipWitness: getNullifierMembershipWitnessResolver(oracle) },
          this.previousKernel.validationRequests.nullifierReadRequests,
          this.nullifierResetStates,
        ),
        await getMasterSecretKeysAndAppKeyGenerators(
          this.previousKernel.validationRequests.scopedKeyValidationRequestsAndGenerators,
          oracle,
        ),
        this.transientDataIndexHints,
        this.validationRequestsSplitCounter,
      ),
      dimensions,
    );
  }

  private reduceReadRequestStates<NUM_READS extends number>(
    resetStates: ReadRequestResetStates<NUM_READS>,
    maxPending: number,
    maxSettled: number,
  ) {
    let numPending = 0;
    let numSettled = 0;
    for (let i = 0; i < resetStates.states.length; i++) {
      const state = resetStates.states[i];
      if (state === ReadRequestState.PENDING) {
        if (numPending < maxPending) {
          numPending++;
        } else {
          resetStates.states[i] = ReadRequestState.NADA;
        }
      } else if (state === ReadRequestState.SETTLED) {
        if (numSettled < maxSettled) {
          numSettled++;
        } else {
          resetStates.states[i] = ReadRequestState.NADA;
        }
      }
    }

    resetStates.pendingReadHints = resetStates.pendingReadHints.slice(0, maxPending);
  }

  private needsResetNoteHashReadRequests(forceResetAll = false) {
    const numCurr = countAccumulatedItems(this.previousKernel.validationRequests.noteHashReadRequests);
    const numNext = this.nextIteration ? countAccumulatedItems(this.nextIteration.noteHashReadRequests) : 0;
    const maxAmountToKeep = !this.nextIteration || forceResetAll ? 0 : MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const futureNoteHashes = collectNested(this.executionStack, executionResult => {
      const nonEmptyNoteHashes = getNonEmptyItems(executionResult.publicInputs.noteHashes);
      return nonEmptyNoteHashes.map(
        noteHash => new ScopedNoteHash(noteHash, executionResult.publicInputs.callContext.contractAddress),
      );
    });

    const resetStates = getNoteHashReadRequestResetStates(
      this.previousKernel.validationRequests.noteHashReadRequests,
      this.previousKernel.end.noteHashes,
      futureNoteHashes,
    );

    const numPendingReads = resetStates.pendingReadHints.length;
    const numSettledReads = resetStates.states.reduce(
      (accum, state) => accum + (state === ReadRequestState.SETTLED ? 1 : 0),
      0,
    );

    if (!this.nextIteration) {
      this.noteHashResetStates = resetStates;
      this.requestedDimensions.NOTE_HASH_PENDING_AMOUNT = numPendingReads;
      this.requestedDimensions.NOTE_HASH_SETTLED_AMOUNT = numSettledReads;
    } else {
      // Pick only one dimension to reset if next iteration is not empty.
      if (numPendingReads > numSettledReads) {
        this.requestedDimensions.NOTE_HASH_PENDING_AMOUNT = numPendingReads;
        this.noteHashResetStates.states = assertLength(
          resetStates.states.map(state => (state === ReadRequestState.PENDING ? state : ReadRequestState.NADA)),
          MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        );
        this.noteHashResetStates.pendingReadHints = resetStates.pendingReadHints;
      } else {
        this.requestedDimensions.NOTE_HASH_SETTLED_AMOUNT = numSettledReads;
        this.noteHashResetStates.states = assertLength(
          resetStates.states.map(state => (state === ReadRequestState.SETTLED ? state : ReadRequestState.NADA)),
          MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        );
      }
    }

    return true;
  }

  private needsResetNullifierReadRequests(forceResetAll = false) {
    const numCurr = countAccumulatedItems(this.previousKernel.validationRequests.nullifierReadRequests);
    const numNext = this.nextIteration ? countAccumulatedItems(this.nextIteration.nullifierReadRequests) : 0;
    const maxAmountToKeep = !this.nextIteration || forceResetAll ? 0 : MAX_NULLIFIER_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const futureNullifiers = collectNested(this.executionStack, executionResult => {
      const nonEmptyNullifiers = getNonEmptyItems(executionResult.publicInputs.nullifiers);
      return nonEmptyNullifiers.map(
        nullifier => new ScopedNullifier(nullifier, executionResult.publicInputs.callContext.contractAddress),
      );
    });

    const resetStates = getNullifierReadRequestResetStates(
      this.previousKernel.validationRequests.nullifierReadRequests,
      this.previousKernel.end.nullifiers,
      futureNullifiers,
    );

    const numPendingReads = resetStates.pendingReadHints.length;
    const numSettledReads = resetStates.states.reduce(
      (accum, state) => accum + (state === ReadRequestState.SETTLED ? 1 : 0),
      0,
    );

    if (!this.nextIteration) {
      this.nullifierResetStates = resetStates;
      this.requestedDimensions.NULLIFIER_PENDING_AMOUNT = numPendingReads;
      this.requestedDimensions.NULLIFIER_SETTLED_AMOUNT = numSettledReads;
    } else {
      // Pick only one dimension to reset if next iteration is not empty.
      if (numPendingReads > numSettledReads) {
        this.requestedDimensions.NULLIFIER_PENDING_AMOUNT = numPendingReads;
        this.nullifierResetStates.states = assertLength(
          resetStates.states.map(state => (state === ReadRequestState.PENDING ? state : ReadRequestState.NADA)),
          MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        );
        this.nullifierResetStates.pendingReadHints = resetStates.pendingReadHints;
      } else {
        this.requestedDimensions.NULLIFIER_SETTLED_AMOUNT = numSettledReads;
        this.nullifierResetStates.states = assertLength(
          resetStates.states.map(state => (state === ReadRequestState.SETTLED ? state : ReadRequestState.NADA)),
          MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        );
      }
    }

    return true;
  }

  private needsResetNullifierKeys() {
    const numCurr = countAccumulatedItems(
      this.previousKernel.validationRequests.scopedKeyValidationRequestsAndGenerators,
    );
    const numNext = this.nextIteration
      ? countAccumulatedItems(this.nextIteration.keyValidationRequestsAndGenerators)
      : 0;
    const maxAmountToKeep = !this.nextIteration ? 0 : MAX_KEY_VALIDATION_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    this.requestedDimensions.NULLIFIER_KEYS = numCurr;

    return true;
  }

  private needsResetTransientData() {
    // Initialize this to 0 so that needsSilo can be run.
    this.numTransientData = 0;

    const nextAccumNoteHashes =
      countAccumulatedItems(this.previousKernel.end.noteHashes) +
      countAccumulatedItems(this.nextIteration?.noteHashes ?? []);
    const noteHashWillOverflow = nextAccumNoteHashes > MAX_NOTE_HASHES_PER_TX;
    const nextAccumNullifiers =
      countAccumulatedItems(this.previousKernel.end.nullifiers) +
      countAccumulatedItems(this.nextIteration?.nullifiers ?? []);
    const nullifierWillOverflow = nextAccumNullifiers > MAX_NULLIFIERS_PER_TX;
    if (this.nextIteration && !noteHashWillOverflow && !nullifierWillOverflow) {
      return false;
    }

    const futureNoteHashReads = collectNestedReadRequests(
      this.executionStack,
      executionResult => executionResult.publicInputs.noteHashReadRequests,
    );
    const futureNullifierReads = collectNestedReadRequests(
      this.executionStack,
      executionResult => executionResult.publicInputs.nullifierReadRequests,
    );
    if (this.nextIteration) {
      // If it's not the final reset, only one dimension will be reset at a time.
      // The note hashes and nullifiers for the remaining read requests can't be squashed.
      futureNoteHashReads.push(
        ...this.previousKernel.validationRequests.noteHashReadRequests.filter(r => !r.isEmpty()),
      );
      futureNullifierReads.push(
        ...this.previousKernel.validationRequests.nullifierReadRequests.filter(r => !r.isEmpty()),
      );
    }

    const { numTransientData, hints: transientDataIndexHints } = buildTransientDataHints(
      this.previousKernel.end.noteHashes,
      this.previousKernel.end.nullifiers,
      futureNoteHashReads,
      futureNullifierReads,
      this.noteHashNullifierCounterMap,
      this.validationRequestsSplitCounter,
      MAX_NOTE_HASHES_PER_TX,
      MAX_NULLIFIERS_PER_TX,
    );

    if (this.nextIteration && !numTransientData) {
      const forceResetAll = true;
      const canClearReadRequests =
        (noteHashWillOverflow && this.needsResetNoteHashReadRequests(forceResetAll)) ||
        (nullifierWillOverflow && this.needsResetNullifierReadRequests(forceResetAll));
      if (!canClearReadRequests) {
        const overflownData = noteHashWillOverflow ? 'note hashes' : 'nullifiers';
        throw new Error(`Number of ${overflownData} exceeds the limit.`);
      }
      // Clearing the read requests might not be enough to squash the overflown data.
      // In this case, the next iteration will fail at the above check.
      return true;
    }

    this.numTransientData = numTransientData;
    this.transientDataIndexHints = transientDataIndexHints;
    this.requestedDimensions.TRANSIENT_DATA_AMOUNT = numTransientData;

    return numTransientData > 0;
  }

  private needsSiloNoteHashes() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNoteHashes`.');
    }

    const numNoteHashes = this.previousKernel.end.noteHashes.filter(n => !n.contractAddress.isZero()).length;
    const numToSilo = Math.max(0, numNoteHashes - this.numTransientData);
    this.requestedDimensions.NOTE_HASH_SILOING_AMOUNT = numToSilo;

    return numToSilo > 0;
  }

  private needsSiloNullifiers() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNullifiers`.');
    }

    const numNullifiers = this.previousKernel.end.nullifiers.filter(n => !n.contractAddress.isZero()).length;
    const numToSilo = Math.max(0, numNullifiers - this.numTransientData);
    // Include the first nullifier if there's something to silo.
    // The reset circuit checks that capped_size must be greater than or equal to all non-empty nullifiers.
    // Which includes the first nullifier, even though its contract address is always zero and doesn't need siloing.
    const cappedSize = numToSilo ? numToSilo + 1 : 0;
    this.requestedDimensions.NULLIFIER_SILOING_AMOUNT = cappedSize;

    return numToSilo > 0;
  }

  private needsSiloPrivateLogs() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloPrivateLogs`.');
    }

    const privateLogs = this.previousKernel.end.privateLogs;
    const numLogs = privateLogs.filter(l => !l.contractAddress.isZero()).length;

    const noteHashes = this.previousKernel.end.noteHashes;
    const squashedNoteHashCounters = this.transientDataIndexHints
      .filter(h => h.noteHashIndex < noteHashes.length)
      .map(h => noteHashes[h.noteHashIndex].counter);
    const numSquashedLogs = privateLogs.filter(l => squashedNoteHashCounters.includes(l.inner.noteHashCounter)).length;

    const numToSilo = numLogs - numSquashedLogs;
    this.requestedDimensions.PRIVATE_LOG_SILOING_AMOUNT = numToSilo;

    return numToSilo > 0;
  }
}
