import {
  type AvmCircuitPublicInputs,
  Fr,
  type Gas,
  type GasSettings,
  type GlobalVariables,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicCallRequest,
  PublicDataWrite,
  type RevertCode,
  type StateReference,
  TreeSnapshots,
  countAccumulatedItems,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { assertLength } from '@aztec/foundation/serialize';

import { type PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';

export function generateAvmCircuitPublicInputs(
  trace: PublicEnqueuedCallSideEffectTrace,
  globalVariables: GlobalVariables,
  startStateReference: StateReference,
  startGasUsed: Gas,
  gasSettings: GasSettings,
  setupCallRequests: PublicCallRequest[],
  appLogicCallRequests: PublicCallRequest[],
  teardownCallRequests: PublicCallRequest[],
  nonRevertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
  revertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
  endTreeSnapshots: TreeSnapshots,
  endGasUsed: Gas,
  transactionFee: Fr,
  revertCode: RevertCode,
): AvmCircuitPublicInputs {
  const startTreeSnapshots = new TreeSnapshots(
    startStateReference.l1ToL2MessageTree,
    startStateReference.partial.noteHashTree,
    startStateReference.partial.nullifierTree,
    startStateReference.partial.publicDataTree,
  );

  const avmCircuitPublicInputs = trace.toAvmCircuitPublicInputs(
    globalVariables,
    startTreeSnapshots,
    startGasUsed,
    gasSettings,
    setupCallRequests,
    appLogicCallRequests,
    teardownCallRequests.length ? teardownCallRequests[0] : PublicCallRequest.empty(),
    endTreeSnapshots,
    endGasUsed,
    transactionFee,
    !revertCode.isOK(),
  );

  const getArrayLengths = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedDataArrayLengths(
      countAccumulatedItems(from.noteHashes),
      countAccumulatedItems(from.nullifiers),
      countAccumulatedItems(from.l2ToL1Msgs),
    );
  const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);
  // Temporary overrides as these entries aren't yet populated in trace
  avmCircuitPublicInputs.previousNonRevertibleAccumulatedDataArrayLengths = getArrayLengths(
    nonRevertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedDataArrayLengths = getArrayLengths(
    revertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousNonRevertibleAccumulatedData = convertAccumulatedData(
    nonRevertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedData = convertAccumulatedData(
    revertibleAccumulatedDataFromPrivate,
  );

  // merge all revertible & non-revertible side effects into output accumulated data
  const noteHashesFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.noteHashes,
        avmCircuitPublicInputs.previousRevertibleAccumulatedData.noteHashes,
      )
    : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.noteHashes;
  avmCircuitPublicInputs.accumulatedData.noteHashes = assertLength(
    mergeAccumulatedData(noteHashesFromPrivate, avmCircuitPublicInputs.accumulatedData.noteHashes),
    MAX_NOTE_HASHES_PER_TX,
  );

  const txHash = avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.nullifiers[0];

  const scopedNoteHashesFromPublic = trace.getSideEffects().noteHashes;
  for (let i = 0; i < scopedNoteHashesFromPublic.length; i++) {
    const scopedNoteHash = scopedNoteHashesFromPublic[i];
    const noteHash = scopedNoteHash.value;
    if (!noteHash.isZero()) {
      const noteHashIndexInTx = i + countAccumulatedItems(noteHashesFromPrivate);
      const nonce = computeNoteHashNonce(txHash, noteHashIndexInTx);
      const uniqueNoteHash = computeUniqueNoteHash(nonce, noteHash);
      const siloedNoteHash = siloNoteHash(scopedNoteHash.contractAddress, uniqueNoteHash);
      avmCircuitPublicInputs.accumulatedData.noteHashes[noteHashIndexInTx] = siloedNoteHash;
    }
  }

  const msgsFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs,
        avmCircuitPublicInputs.previousRevertibleAccumulatedData.l2ToL1Msgs,
      )
    : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs;
  avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs = assertLength(
    mergeAccumulatedData(msgsFromPrivate, avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs),
    MAX_L2_TO_L1_MSGS_PER_TX,
  );

  // Maps slot to value. Maps in TS are iterable in insertion order, which is exactly what we want for
  // squashing "to the left", where the first occurrence of a slot uses the value of the last write to it,
  // and the rest occurrences are omitted
  const squashedPublicDataWrites: Map<bigint, Fr> = new Map();
  for (const publicDataWrite of avmCircuitPublicInputs.accumulatedData.publicDataWrites) {
    squashedPublicDataWrites.set(publicDataWrite.leafSlot.toBigInt(), publicDataWrite.value);
  }

  avmCircuitPublicInputs.accumulatedData.publicDataWrites = padArrayEnd(
    Array.from(squashedPublicDataWrites.entries()).map(([slot, value]) => new PublicDataWrite(new Fr(slot), value)),
    PublicDataWrite.empty(),
    MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  );
  //console.log(`AvmCircuitPublicInputs:\n${inspect(avmCircuitPublicInputs)}`);
  return avmCircuitPublicInputs;
}
