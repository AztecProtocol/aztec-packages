import { makeProcessedTx, mockTx } from '@aztec/circuit-types';
import {
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
  PublicKernelCircuitPublicInputs,
  SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { fr, makeNewSideEffect, makeNewSideEffectLinkedToNoteHash, makeProof } from '@aztec/circuits.js/testing';
import { makeTuple } from '@aztec/foundation/array';
import { toTruncField } from '@aztec/foundation/serialize';
import { MerkleTreeOperations } from '@aztec/world-state';

export const makeBloatedProcessedTx = async (builderDb: MerkleTreeOperations, seed = 0x1) => {
  seed *= MAX_NEW_NULLIFIERS_PER_TX; // Ensure no clashing given incremental seeds
  const tx = mockTx(seed);
  const kernelOutput = PublicKernelCircuitPublicInputs.empty();
  kernelOutput.constants.historicalHeader = await builderDb.buildInitialHeader();
  kernelOutput.end.publicDataUpdateRequests = makeTuple(
    MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
    seed + 0x500,
  );
  kernelOutput.endNonRevertibleData.publicDataUpdateRequests = makeTuple(
    MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
    seed + 0x600,
  );

  const processedTx = makeProcessedTx(tx, kernelOutput, makeProof());

  processedTx.data.end.newNoteHashes = makeTuple(MAX_REVERTIBLE_NOTE_HASHES_PER_TX, makeNewSideEffect, seed + 0x100);
  processedTx.data.endNonRevertibleData.newNoteHashes = makeTuple(
    MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX,
    makeNewSideEffect,
    seed + 0x100,
  );
  processedTx.data.end.newNullifiers = makeTuple(
    MAX_REVERTIBLE_NULLIFIERS_PER_TX,
    makeNewSideEffectLinkedToNoteHash,
    seed + 0x100000,
  );

  processedTx.data.endNonRevertibleData.newNullifiers = makeTuple(
    MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
    makeNewSideEffectLinkedToNoteHash,
    seed + 0x100000 + MAX_REVERTIBLE_NULLIFIERS_PER_TX,
  );

  processedTx.data.end.newNullifiers[tx.data.end.newNullifiers.length - 1] = SideEffectLinkedToNoteHash.empty();

  processedTx.data.end.newL2ToL1Msgs = makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x300);
  processedTx.data.end.encryptedLogsHash = toTruncField(processedTx.encryptedLogs.hash());
  processedTx.data.end.unencryptedLogsHash = toTruncField(processedTx.unencryptedLogs.hash());

  return processedTx;
};
