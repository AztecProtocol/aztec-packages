import { Fr } from '@aztec/foundation/fields';

import type { AvmProvingRequest } from '../avm/avm_proving_request.js';
import type { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import type { SimulationError } from '../errors/simulation_error.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { siloL2ToL1Message } from '../hash/hash.js';
import { CombinedConstantData } from '../kernel/combined_constant_data.js';
import type { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import type { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import type { GlobalVariables } from './global_variables.js';
import type { Tx } from './tx.js';
import { TxEffect } from './tx_effect.js';
import type { TxHash } from './tx_hash.js';

export enum TxExecutionPhase {
  SETUP,
  APP_LOGIC,
  TEARDOWN,
}

/**
 * Represents a tx that has been processed by the sequencer public processor,
 * so its kernel circuit public inputs are filled in.
 */
export type ProcessedTx = {
  /**
   * Hash of the transaction.
   */
  hash: TxHash;
  /**
   * Tx.data. The output of the private kernel tail or tail_to_public.
   */
  data: PrivateKernelTailCircuitPublicInputs;
  /**
   * Proof for the private execution.
   */
  clientIvcProof: ClientIvcProof;
  /**
   * The request for AVM proving.
   */
  avmProvingRequest: AvmProvingRequest | undefined;
  /**
   * Combining `TxConstantData` specified by the user, and `GlobalVariables` injected by the sequencer.
   */
  constants: CombinedConstantData;
  /**
   * Output data of the tx.
   */
  txEffect: TxEffect;
  /*
   * Gas used by the entire transaction.
   */
  gasUsed: GasUsed;
  /**
   * Reason the tx was reverted.
   */
  revertReason: SimulationError | undefined;
};

/**
 * Represents a tx that failed to be processed by the sequencer public processor.
 */
export type FailedTx = {
  /**
   * The failing transaction.
   */
  tx: Tx;
  /**
   * The error that caused the tx to fail.
   */
  error: Error;
};

export async function makeProcessedTxFromPrivateOnlyTx(
  tx: Tx,
  transactionFee: Fr,
  feePaymentPublicDataWrite: PublicDataWrite,
  globalVariables: GlobalVariables,
): Promise<ProcessedTx> {
  const constants = CombinedConstantData.combine(tx.data.constants, globalVariables);

  const data = tx.data.forRollup!;
  const txEffect = new TxEffect(
    RevertCode.OK,
    await tx.getTxHash(),
    transactionFee,
    data.end.noteHashes.filter(h => !h.isZero()),
    data.end.nullifiers.filter(h => !h.isZero()),
    data.end.l2ToL1Msgs
      .map(message => siloL2ToL1Message(message, constants.txContext.version, constants.txContext.chainId))
      .filter(h => !h.isZero()),
    [feePaymentPublicDataWrite],
    data.end.privateLogs.filter(l => !l.isEmpty()),
    [],
    await tx.filterContractClassLogs(tx.data.getNonEmptyContractClassLogsHashes(), true),
  );

  const gasUsed = {
    // Billed gas is the same as total gas since there is no teardown execution
    totalGas: tx.data.gasUsed,
    billedGas: tx.data.gasUsed,
    teardownGas: Gas.empty(),
    publicGas: Gas.empty(),
  } satisfies GasUsed;

  return {
    hash: txEffect.txHash,
    data: tx.data,
    clientIvcProof: tx.clientIvcProof,
    avmProvingRequest: undefined,
    constants,
    txEffect,
    gasUsed,
    revertReason: undefined,
  };
}

export function toNumBlobFields(txs: ProcessedTx[]): number {
  return txs.reduce((acc, tx) => {
    return acc + tx.txEffect.toBlobFields().length;
  }, 0);
}

export async function makeProcessedTxFromTxWithPublicCalls(
  tx: Tx,
  avmProvingRequest: AvmProvingRequest,
  gasUsed: GasUsed,
  revertCode: RevertCode,
  revertReason: SimulationError | undefined,
): Promise<ProcessedTx> {
  const avmPublicInputs = avmProvingRequest.inputs.publicInputs;

  const constants = CombinedConstantData.combine(tx.data.constants, avmPublicInputs.globalVariables);

  const publicDataWrites = avmPublicInputs.accumulatedData.publicDataWrites.filter(w => !w.isEmpty());

  const privateLogs = [
    ...tx.data.forPublic!.nonRevertibleAccumulatedData.privateLogs,
    ...(revertCode.isOK() ? tx.data.forPublic!.revertibleAccumulatedData.privateLogs : []),
  ].filter(l => !l.isEmpty());

  const contractClassLogs = [
    ...(await tx.getSplitContractClassLogs(false, true)),
    ...(revertCode.isOK() ? await tx.getSplitContractClassLogs(true, true) : []),
  ].filter(l => !l.isEmpty());

  const txEffect = new TxEffect(
    revertCode,
    await tx.getTxHash(),
    avmPublicInputs.transactionFee,
    avmPublicInputs.accumulatedData.noteHashes.filter(h => !h.isZero()),
    avmPublicInputs.accumulatedData.nullifiers.filter(h => !h.isZero()),
    avmPublicInputs.accumulatedData.l2ToL1Msgs
      .map(message => siloL2ToL1Message(message, constants.txContext.version, constants.txContext.chainId))
      .filter(h => !h.isZero()),
    publicDataWrites,
    privateLogs,
    avmPublicInputs.accumulatedData.publicLogs.filter(l => !l.isEmpty()),
    contractClassLogs,
  );

  return {
    hash: txEffect.txHash,
    data: tx.data,
    clientIvcProof: tx.clientIvcProof,
    avmProvingRequest,
    constants,
    txEffect,
    gasUsed,
    revertReason,
  };
}
