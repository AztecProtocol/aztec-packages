import { type PrivateKernelSimulateOutput } from '@aztec/circuit-types';
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
  NoteHashReadRequestResetStates,
  NullifierReadRequestResetStates,
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  PrivateKernelResetCircuitPrivateInputs,
  PrivateKernelResetDimensions,
  PrivateKernelResetHints,
  type ReadRequest,
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
import { privateKernelResetDimensionsConfig } from '@aztec/noir-protocol-circuits-types';
import { type ExecutionResult, collectNested } from '@aztec/simulator';

import { type ProvingDataOracle } from '../proving_data_oracle.js';

function collectNestedReadRequests(
  executionStack: ExecutionResult[],
  extractReadRequests: (execution: ExecutionResult) => ReadRequest[],
): ScopedReadRequest[] {
  return collectNested(executionStack, executionResult => {
    const nonEmptyReadRequests = getNonEmptyItems(extractReadRequests(executionResult));
    return nonEmptyReadRequests.map(
      readRequest =>
        new ScopedReadRequest(
          readRequest,
          executionResult.callStackItem.publicInputs.callContext.storageContractAddress,
        ),
    );
  });
}

function getNullifierMembershipWitnessResolver(oracle: ProvingDataOracle) {
  return async (nullifier: Fr) => {
    const res = await oracle.getNullifierMembershipWitness(nullifier);
    if (!res) {
      throw new Error(`Cannot find the leaf for nullifier ${nullifier.toBigInt()}.`);
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

  private noteHashResetStates: NoteHashReadRequestResetStates;
  private nullifierResetStates: NullifierReadRequestResetStates;
  private numTransientData?: number;
  private transientDataIndexHints: Tuple<TransientDataIndexHint, typeof MAX_NULLIFIERS_PER_TX>;
  private requestedDimensions: PrivateKernelResetDimensions;

  constructor(
    private previousKernelOutput: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>,
    private executionStack: ExecutionResult[],
    private noteHashNullifierCounterMap: Map<number, number>,
    private validationRequestsSplitCounter: number,
  ) {
    this.previousKernel = previousKernelOutput.publicInputs;
    this.requestedDimensions = PrivateKernelResetDimensions.empty();
    this.noteHashResetStates = NoteHashReadRequestResetStates.empty();
    this.nullifierResetStates = NullifierReadRequestResetStates.empty();
    this.transientDataIndexHints = makeTuple(MAX_NULLIFIERS_PER_TX, () => TransientDataIndexHint.empty());
    this.nextIteration = executionStack[this.executionStack.length - 1]?.callStackItem.publicInputs;
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
        ...[() => this.needsSiloNoteHashes(), () => this.needsSiloNullifiers(), () => this.needsSiloLogHashes()],
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

    const dimensions = findPrivateKernelResetDimensions(this.requestedDimensions, privateKernelResetDimensionsConfig);

    const previousVkMembershipWitness = await oracle.getVkMembershipWitness(this.previousKernelOutput.verificationKey);
    const previousKernelData = new PrivateKernelData(
      this.previousKernelOutput.publicInputs,
      this.previousKernelOutput.verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      assertLength<Fr, typeof VK_TREE_HEIGHT>(previousVkMembershipWitness.siblingPath, VK_TREE_HEIGHT),
    );

    const getNullifierMembershipWitness = getNullifierMembershipWitnessResolver(oracle);

    const keysHints = await getMasterSecretKeysAndAppKeyGenerators(
      this.previousKernel.validationRequests.scopedKeyValidationRequestsAndGenerators,
      oracle,
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
          { getNullifierMembershipWitness },
          this.previousKernel.validationRequests.nullifierReadRequests,
          this.nullifierResetStates,
        ),
        keysHints,
        this.transientDataIndexHints,
        this.validationRequestsSplitCounter,
      ),
      dimensions,
    );
  }

  private needsResetNoteHashReadRequests() {
    const numCurr = countAccumulatedItems(this.previousKernel.validationRequests.noteHashReadRequests);
    const numNext = this.nextIteration ? countAccumulatedItems(this.nextIteration.noteHashReadRequests) : 0;
    const maxAmountToKeep = !this.nextIteration ? 0 : MAX_NOTE_HASH_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const futureNoteHashes = collectNested(this.executionStack, executionResult => {
      const nonEmptyNoteHashes = getNonEmptyItems(executionResult.callStackItem.publicInputs.noteHashes);
      return nonEmptyNoteHashes.map(
        noteHash =>
          new ScopedNoteHash(noteHash, executionResult.callStackItem.publicInputs.callContext.storageContractAddress),
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

  private needsResetNullifierReadRequests() {
    const numCurr = countAccumulatedItems(this.previousKernel.validationRequests.nullifierReadRequests);
    const numNext = this.nextIteration ? countAccumulatedItems(this.nextIteration.nullifierReadRequests) : 0;
    const maxAmountToKeep = !this.nextIteration ? 0 : MAX_NULLIFIER_READ_REQUESTS_PER_TX;
    if (numCurr + numNext <= maxAmountToKeep) {
      return false;
    }

    const futureNullifiers = collectNested(this.executionStack, executionResult => {
      const nonEmptyNullifiers = getNonEmptyItems(executionResult.callStackItem.publicInputs.nullifiers);
      return nonEmptyNullifiers.map(
        nullifier =>
          new ScopedNullifier(nullifier, executionResult.callStackItem.publicInputs.callContext.storageContractAddress),
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
    const futureNoteHashReads = collectNestedReadRequests(
      this.executionStack,
      executionResult => executionResult.callStackItem.publicInputs.noteHashReadRequests,
    );

    const futureNullifierReads = collectNestedReadRequests(
      this.executionStack,
      executionResult => executionResult.callStackItem.publicInputs.nullifierReadRequests,
    );

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

    this.numTransientData = numTransientData;
    this.transientDataIndexHints = transientDataIndexHints;
    this.requestedDimensions.TRANSIENT_DATA_AMOUNT = numTransientData;

    return numTransientData > 0;
  }

  private needsSiloNoteHashes() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNoteHashes`.');
    }

    const numNoteHashes = this.previousKernel.end.noteHashes.filter(n => !n.contractAddress.isEmpty()).length;
    const numToSilo = Math.max(0, numNoteHashes - this.numTransientData);
    this.requestedDimensions.NOTE_HASH_SILOING_AMOUNT = numToSilo;

    return numToSilo > 0;
  }

  private needsSiloNullifiers() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloNullifiers`.');
    }

    const numNullifiers = this.previousKernel.end.nullifiers.filter(n => !n.contractAddress.isEmpty()).length;
    const numToSilo = Math.max(0, numNullifiers - this.numTransientData);
    // Include the first nullifier if there's something to silo.
    // The reset circuit checks that capped_size must be greater than or equal to all non-empty nullifiers.
    // Which includes the first nullifier, even though its contract address is always zero and doesn't need siloing.
    const cappedSize = numToSilo ? numToSilo + 1 : 0;
    this.requestedDimensions.NULLIFIER_SILOING_AMOUNT = cappedSize;

    return numToSilo > 0;
  }

  private needsSiloLogHashes() {
    if (this.numTransientData === undefined) {
      throw new Error('`needsResetTransientData` must be run before `needsSiloLogHashes`.');
    }

    const numLogs = this.previousKernel.end.encryptedLogsHashes.filter(l => !l.logHash.randomness.isZero()).length;
    const numToSilo = Math.max(0, numLogs - this.numTransientData);
    this.requestedDimensions.ENCRYPTED_LOG_SILOING_AMOUNT = numToSilo;

    return numToSilo > 0;
  }
}
