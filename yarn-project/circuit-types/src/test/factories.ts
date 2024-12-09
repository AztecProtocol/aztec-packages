import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  type BlockHeader,
  FIXED_DA_GAS,
  FIXED_L2_GAS,
  Fr,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicCircuitPublicInputs,
  PublicDataWrite,
  RevertCode,
  ScopedLogHash,
  TxConstantData,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { makeCombinedAccumulatedData, makePrivateToPublicAccumulatedData } from '@aztec/circuits.js/testing';
import { makeTuple } from '@aztec/foundation/array';

import { type MerkleTreeReadOperations } from '../interfaces/merkle_tree_operations.js';
import { ProvingRequestType } from '../interfaces/proving-job.js';
import { makeHeader } from '../l2_block_code_to_purge.js';
import { mockTx } from '../mocks.js';
import { makeProcessedTxFromPrivateOnlyTx, makeProcessedTxFromTxWithPublicCalls } from '../tx/processed_tx.js';

/** Makes a bloated processed tx for testing purposes. */
export function makeBloatedProcessedTx({
  seed = 1,
  header,
  db,
  chainId = Fr.ZERO,
  version = Fr.ZERO,
  gasSettings = GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
  vkTreeRoot = Fr.ZERO,
  protocolContractTreeRoot = Fr.ZERO,
  globalVariables = GlobalVariables.empty(),
  privateOnly = false,
}: {
  seed?: number;
  header?: BlockHeader;
  db?: MerkleTreeReadOperations;
  chainId?: Fr;
  version?: Fr;
  gasSettings?: GasSettings;
  vkTreeRoot?: Fr;
  globalVariables?: GlobalVariables;
  protocolContractTreeRoot?: Fr;
  privateOnly?: boolean;
} = {}) {
  seed *= 0x1000; // Avoid clashing with the previous mock values if seed only increases by 1.
  header ??= db?.getInitialHeader() ?? makeHeader(seed);

  const txConstantData = TxConstantData.empty();
  txConstantData.historicalHeader = header;
  txConstantData.txContext.chainId = chainId;
  txConstantData.txContext.version = version;
  txConstantData.txContext.gasSettings = gasSettings;
  txConstantData.vkTreeRoot = vkTreeRoot;
  txConstantData.protocolContractTreeRoot = protocolContractTreeRoot;

  const tx = !privateOnly
    ? mockTx(seed)
    : mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });
  tx.data.constants = txConstantData;

  // No side effects were created in mockTx. The default gasUsed is the tx overhead.
  tx.data.gasUsed = Gas.from({ daGas: FIXED_DA_GAS, l2Gas: FIXED_L2_GAS });

  if (privateOnly) {
    const data = makeCombinedAccumulatedData(seed + 0x1000);

    // Private-only tx has no public data writes.
    data.publicDataWrites.forEach((_, i) => (data.publicDataWrites[i] = PublicDataWrite.empty()));

    const transactionFee = tx.data.gasUsed.computeFee(globalVariables.gasFees);

    clearLogs(data);

    tx.data.forRollup!.end = data;

    return makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      undefined /* feePaymentPublicDataWrite */,
      globalVariables,
    );
  } else {
    const nonRevertibleData = tx.data.forPublic!.nonRevertibleAccumulatedData;
    const revertibleData = makePrivateToPublicAccumulatedData(seed + 0x1000);

    revertibleData.nullifiers[MAX_NULLIFIERS_PER_TX - 1] = Fr.ZERO; // Leave one space for the tx hash nullifier in nonRevertibleAccumulatedData.

    clearLogs(revertibleData);

    tx.data.forPublic!.revertibleAccumulatedData = revertibleData;

    const avmOutput = AvmCircuitPublicInputs.empty();
    avmOutput.globalVariables = globalVariables;
    avmOutput.accumulatedData.noteHashes = revertibleData.noteHashes;
    avmOutput.accumulatedData.nullifiers = mergeAccumulatedData(
      nonRevertibleData.nullifiers,
      revertibleData.nullifiers,
      MAX_NULLIFIERS_PER_TX,
    );
    avmOutput.accumulatedData.l2ToL1Msgs = revertibleData.l2ToL1Msgs;
    avmOutput.accumulatedData.publicDataWrites = makeTuple(
      MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      i => new PublicDataWrite(new Fr(i), new Fr(i + 10)),
      seed + 0x2000,
    );

    const avmCircuitInputs = new AvmCircuitInputs(
      '',
      [],
      PublicCircuitPublicInputs.empty(),
      AvmExecutionHints.empty(),
      avmOutput,
    );

    const gasUsed = {
      totalGas: Gas.empty(),
      teardownGas: Gas.empty(),
    };

    return makeProcessedTxFromTxWithPublicCalls(
      tx,
      {
        type: ProvingRequestType.PUBLIC_VM,
        inputs: avmCircuitInputs,
      },
      gasUsed,
      RevertCode.OK,
      undefined /* revertReason */,
    );
  }
}

// Remove all logs as it's ugly to mock them at the moment and we are going to change it to have the preimages be part of the public inputs soon.
function clearLogs(data: { unencryptedLogsHashes?: ScopedLogHash[]; contractClassLogsHashes: ScopedLogHash[] }) {
  data.unencryptedLogsHashes?.forEach((_, i) => (data.unencryptedLogsHashes![i] = ScopedLogHash.empty()));
  data.contractClassLogsHashes.forEach((_, i) => (data.contractClassLogsHashes[i] = ScopedLogHash.empty()));
}
