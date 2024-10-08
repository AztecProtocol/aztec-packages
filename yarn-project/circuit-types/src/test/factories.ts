import { type MerkleTreeReadOperations, makeProcessedTx, mockTx } from '@aztec/circuit-types';
import {
  Fr,
  GasSettings,
  type Header,
  KernelCircuitPublicInputs,
  LogHash,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
  ScopedLogHash,
} from '@aztec/circuits.js';
import { makeScopedL2ToL1Message } from '@aztec/circuits.js/testing';
import { makeTuple } from '@aztec/foundation/array';

/** Makes a bloated processed tx for testing purposes. */
export function makeBloatedProcessedTx(
  historicalHeaderOrDb: Header | MerkleTreeReadOperations,
  vkRoot: Fr,
  protocolContractTreeRoot: Fr,
  seed = 0x1,
  overrides: { inclusionFee?: Fr } = {},
) {
  seed *= MAX_NULLIFIERS_PER_TX; // Ensure no clashing given incremental seeds
  const tx = mockTx(seed);
  const kernelOutput = KernelCircuitPublicInputs.empty();
  kernelOutput.constants.vkTreeRoot = vkRoot;
  kernelOutput.constants.protocolContractTreeRoot = protocolContractTreeRoot;
  kernelOutput.constants.historicalHeader =
    'getInitialHeader' in historicalHeaderOrDb ? historicalHeaderOrDb.getInitialHeader() : historicalHeaderOrDb;
  kernelOutput.end.publicDataUpdateRequests = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(new Fr(i), new Fr(i + 10), i + 20),
    seed + 0x500,
  );
  kernelOutput.end.publicDataUpdateRequests = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => new PublicDataUpdateRequest(new Fr(i), new Fr(i + 10), i + 20),
    seed + 0x600,
  );

  kernelOutput.constants.txContext.gasSettings = GasSettings.default({ inclusionFee: overrides.inclusionFee });

  const processedTx = makeProcessedTx(tx, kernelOutput, []);

  processedTx.data.end.noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, i => new Fr(i), seed + 0x100);
  processedTx.data.end.nullifiers = makeTuple(MAX_NULLIFIERS_PER_TX, i => new Fr(i), seed + 0x100000);

  processedTx.data.end.nullifiers[tx.data.forPublic!.end.nullifiers.length - 1] = Fr.zero();

  processedTx.data.end.l2ToL1Msgs = makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, makeScopedL2ToL1Message, seed + 0x300);
  processedTx.noteEncryptedLogs.unrollLogs().forEach((log, i) => {
    processedTx.data.end.noteEncryptedLogsHashes[i] = new LogHash(Fr.fromBuffer(log.hash()), 0, new Fr(log.length));
  });
  processedTx.encryptedLogs.unrollLogs().forEach((log, i) => {
    processedTx.data.end.encryptedLogsHashes[i] = new ScopedLogHash(
      new LogHash(Fr.fromBuffer(log.hash()), 0, new Fr(log.length)),
      log.maskedContractAddress,
    );
  });

  return processedTx;
}
