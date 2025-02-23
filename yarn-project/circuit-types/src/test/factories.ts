import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  PublicDataWrite,
  RevertCode,
} from '@aztec/circuits.js/avm';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/circuits.js/gas';
import { ScopedLogHash, mergeAccumulatedData } from '@aztec/circuits.js/kernel';
import { PublicLog } from '@aztec/circuits.js/logs';
import { makePrivateToPublicAccumulatedData, makePrivateToRollupAccumulatedData } from '@aztec/circuits.js/testing';
import { BlockHeader, GlobalVariables, TxConstantData } from '@aztec/circuits.js/tx';
import {
  FIXED_DA_GAS,
  FIXED_L2_GAS,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';

import { type MerkleTreeReadOperations } from '../interfaces/merkle_tree_operations.js';
import { ProvingRequestType } from '../interfaces/proving-job.js';
import { makeHeader } from '../l2_block_code_to_purge.js';
import { type GasUsed } from '../tx/gas_used.js';
import { makeProcessedTxFromPrivateOnlyTx, makeProcessedTxFromTxWithPublicCalls } from '../tx/processed_tx.js';
import { mockTx } from './mocks.js';

/** Makes a bloated processed tx for testing purposes. */
export async function makeBloatedProcessedTx({
  seed = 1,
  header,
  db,
  chainId = Fr.ZERO,
  version = Fr.ZERO,
  gasSettings = GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
  vkTreeRoot = Fr.ZERO,
  protocolContractTreeRoot = Fr.ZERO,
  globalVariables = GlobalVariables.empty(),
  feePayer,
  feePaymentPublicDataWrite,
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
  feePayer?: AztecAddress;
  feePaymentPublicDataWrite?: PublicDataWrite;
  privateOnly?: boolean;
} = {}) {
  seed *= 0x1000; // Avoid clashing with the previous mock values if seed only increases by 1.
  header ??= db?.getInitialHeader() ?? makeHeader(seed);
  feePayer ??= await AztecAddress.random();

  const txConstantData = TxConstantData.empty();
  txConstantData.historicalHeader = header!;
  txConstantData.txContext.chainId = chainId;
  txConstantData.txContext.version = version;
  txConstantData.txContext.gasSettings = gasSettings;
  txConstantData.vkTreeRoot = vkTreeRoot;
  txConstantData.protocolContractTreeRoot = protocolContractTreeRoot;

  const tx = !privateOnly
    ? await mockTx(seed, { feePayer })
    : await mockTx(seed, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
        feePayer,
      });
  tx.data.constants = txConstantData;

  // No side effects were created in mockTx. The default gasUsed is the tx overhead.
  tx.data.gasUsed = Gas.from({ daGas: FIXED_DA_GAS, l2Gas: FIXED_L2_GAS });

  if (privateOnly) {
    const data = makePrivateToRollupAccumulatedData(seed + 0x1000);

    const transactionFee = tx.data.gasUsed.computeFee(globalVariables.gasFees);
    feePaymentPublicDataWrite ??= new PublicDataWrite(Fr.random(), Fr.random());

    clearLogs(data);

    tx.data.forRollup!.end = data;

    return makeProcessedTxFromPrivateOnlyTx(tx, transactionFee, feePaymentPublicDataWrite, globalVariables);
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

    const avmCircuitInputs = new AvmCircuitInputs('', [], AvmExecutionHints.empty(), avmOutput);

    const gasUsed = {
      totalGas: Gas.empty(),
      teardownGas: Gas.empty(),
      publicGas: Gas.empty(),
      billedGas: Gas.empty(),
    } satisfies GasUsed;

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
function clearLogs(data: { publicLogs?: PublicLog[]; contractClassLogsHashes: ScopedLogHash[] }) {
  data.publicLogs?.forEach((_, i) => (data.publicLogs![i] = PublicLog.empty()));
  data.contractClassLogsHashes.forEach((_, i) => (data.contractClassLogsHashes[i] = ScopedLogHash.empty()));
}
