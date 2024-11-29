import {
  ClientIvcProof,
  CombinedConstantData,
  Fr,
  Gas,
  type GlobalVariables,
  type Header,
  PrivateKernelTailCircuitPublicInputs,
  type PublicDataWrite,
  RevertCode,
} from '@aztec/circuits.js';
import { siloL2ToL1Message } from '@aztec/circuits.js/hash';

import { type AvmProvingRequest } from '../interfaces/proving-job.js';
import { type SimulationError } from '../simulation_error.js';
import { TxEffect } from '../tx_effect.js';
import { type GasUsed } from './gas_used.js';
import { type Tx } from './tx.js';
import { TxHash } from './tx_hash.js';

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
  /**
   * Flag indicating the tx is 'empty' meaning it's a padding tx to take us to a power of 2.
   */
  isEmpty: boolean;
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

/**
 * Makes an empty tx from an empty kernel circuit public inputs.
 * @returns A processed empty tx.
 */
export function makeEmptyProcessedTx(
  header: Header,
  chainId: Fr,
  version: Fr,
  vkTreeRoot: Fr,
  protocolContractTreeRoot: Fr,
): ProcessedTx {
  const constants = CombinedConstantData.empty();
  constants.historicalHeader = header;
  constants.txContext.chainId = chainId;
  constants.txContext.version = version;
  constants.vkTreeRoot = vkTreeRoot;
  constants.protocolContractTreeRoot = protocolContractTreeRoot;

  const clientProofOutput = PrivateKernelTailCircuitPublicInputs.empty();
  clientProofOutput.constants = constants;

  return {
    hash: new TxHash(Fr.ZERO.toBuffer()),
    data: clientProofOutput,
    clientIvcProof: ClientIvcProof.empty(),
    avmProvingRequest: undefined,
    constants,
    txEffect: TxEffect.empty(),
    gasUsed: {
      totalGas: Gas.empty(),
      teardownGas: Gas.empty(),
    },
    revertReason: undefined,
    isEmpty: true,
  };
}

export function makeProcessedTxFromPrivateOnlyTx(
  tx: Tx,
  transactionFee: Fr,
  feePaymentPublicDataWrite: PublicDataWrite | undefined,
  globalVariables: GlobalVariables,
): ProcessedTx {
  const constants = CombinedConstantData.combine(tx.data.constants, globalVariables);

  const publicDataWrites = feePaymentPublicDataWrite ? [feePaymentPublicDataWrite] : [];

  const data = tx.data.forRollup!;
  const txEffect = new TxEffect(
    RevertCode.OK,
    transactionFee,
    data.end.noteHashes.filter(h => !h.isZero()),
    data.end.nullifiers.filter(h => !h.isZero()),
    data.end.l2ToL1Msgs
      .map(message => siloL2ToL1Message(message, constants.txContext.version, constants.txContext.chainId))
      .filter(h => !h.isZero()),
    publicDataWrites,
    data.end.noteEncryptedLogPreimagesLength,
    data.end.encryptedLogPreimagesLength,
    data.end.unencryptedLogPreimagesLength,
    data.end.contractClassLogPreimagesLength,
    tx.noteEncryptedLogs,
    tx.encryptedLogs,
    tx.unencryptedLogs,
    tx.contractClassLogs,
  );

  const gasUsed = {
    totalGas: tx.data.gasUsed,
    teardownGas: Gas.empty(),
  };

  return {
    hash: tx.getTxHash(),
    data: tx.data,
    clientIvcProof: tx.clientIvcProof,
    avmProvingRequest: undefined,
    constants,
    txEffect,
    gasUsed,
    revertReason: undefined,
    isEmpty: false,
  };
}

export function makeProcessedTxFromTxWithPublicCalls(
  tx: Tx,
  avmProvingRequest: AvmProvingRequest,
  feePaymentPublicDataWrite: PublicDataWrite | undefined,
  gasUsed: GasUsed,
  revertCode: RevertCode,
  revertReason: SimulationError | undefined,
): ProcessedTx {
  const avmOutput = avmProvingRequest.inputs.output;

  const constants = CombinedConstantData.combine(tx.data.constants, avmOutput.globalVariables);

  const publicDataWrites = avmOutput.accumulatedData.publicDataWrites.filter(w => !w.isEmpty());
  if (feePaymentPublicDataWrite) {
    const existingIndex = publicDataWrites.findIndex(w => w.leafSlot.equals(feePaymentPublicDataWrite.leafSlot));
    if (existingIndex >= 0) {
      publicDataWrites[existingIndex] = feePaymentPublicDataWrite;
    } else {
      publicDataWrites.push(feePaymentPublicDataWrite);
    }
  }

  const noteEncryptedLogPreimagesLength = tx.noteEncryptedLogs.getKernelLength();
  const encryptedLogPreimagesLength = tx.encryptedLogs.getKernelLength();
  // Unencrypted logs emitted from public functions are inserted to tx.unencryptedLogs directly :(
  const unencryptedLogPreimagesLength = tx.unencryptedLogs.getKernelLength();
  const contractClassLogPreimagesLength = tx.contractClassLogs.getKernelLength();

  const txEffect = new TxEffect(
    revertCode,
    avmOutput.transactionFee,
    avmOutput.accumulatedData.noteHashes.filter(h => !h.isZero()),
    avmOutput.accumulatedData.nullifiers.filter(h => !h.isZero()),
    avmOutput.accumulatedData.l2ToL1Msgs
      .map(message => siloL2ToL1Message(message, constants.txContext.version, constants.txContext.chainId))
      .filter(h => !h.isZero()),
    publicDataWrites,
    new Fr(noteEncryptedLogPreimagesLength),
    new Fr(encryptedLogPreimagesLength),
    new Fr(unencryptedLogPreimagesLength),
    new Fr(contractClassLogPreimagesLength),
    tx.noteEncryptedLogs,
    tx.encryptedLogs,
    tx.unencryptedLogs,
    tx.contractClassLogs,
  );

  return {
    hash: tx.getTxHash(),
    data: tx.data,
    clientIvcProof: tx.clientIvcProof,
    avmProvingRequest,
    constants,
    txEffect,
    gasUsed,
    revertReason,
    isEmpty: false,
  };
}
