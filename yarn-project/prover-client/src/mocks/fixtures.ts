import { makeProcessedTx, mockTx } from '@aztec/circuit-types';
import {
  Fr,
  KernelCircuitPublicInputs,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
} from '@aztec/circuits.js';
import { fr, makeProof } from '@aztec/circuits.js/testing';
import { makeTuple } from '@aztec/foundation/array';
import { type MerkleTreeOperations } from '@aztec/world-state';

export const makeBloatedProcessedTx = async (builderDb: MerkleTreeOperations, seed = 0x1) => {
  seed *= MAX_NEW_NULLIFIERS_PER_TX; // Ensure no clashing given incremental seeds
  const tx = mockTx(seed);
  const kernelOutput = KernelCircuitPublicInputs.empty();
  kernelOutput.constants.historicalHeader = await builderDb.buildInitialHeader();
  kernelOutput.end.publicDataUpdateRequests = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
    seed + 0x500,
  );
  kernelOutput.end.publicDataUpdateRequests = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
    seed + 0x600,
  );

  const processedTx = makeProcessedTx(tx, kernelOutput, makeProof(), []);

  processedTx.data.end.newNoteHashes = makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, fr, seed + 0x100);
  processedTx.data.end.newNullifiers = makeTuple(MAX_NEW_NULLIFIERS_PER_TX, fr, seed + 0x100000);

  processedTx.data.end.newNullifiers[tx.data.forPublic!.end.newNullifiers.length - 1] = Fr.zero();

  processedTx.data.end.newL2ToL1Msgs = makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x300);
  processedTx.data.end.encryptedLogsHash = Fr.fromBuffer(processedTx.encryptedLogs.hash());
  processedTx.data.end.unencryptedLogsHash = Fr.fromBuffer(processedTx.unencryptedLogs.hash());

  return processedTx;
};
