import { Fr } from '@aztec/foundation/curves/bn254';

import type { PublicTxEffect } from '../avm/avm.js';
import type { AvmProvingRequest } from '../avm/avm_proving_request.js';
import type { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { SimulationError } from '../errors/simulation_error.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { computeL2ToL1MessageHash } from '../hash/hash.js';
import type { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import type { ChonkProof } from '../proofs/chonk_proof.js';
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
  chonkProof: ChonkProof;
  /**
   * The request for AVM proving.
   */
  avmProvingRequest: AvmProvingRequest | undefined;
  /**
   * `GlobalVariables` injected by the sequencer. It's the same for all the txs in a block.
   */
  globalVariables: GlobalVariables;
  /**
   * Output data of the tx.
   */
  txEffect: TxEffect;
  /*
   * Gas used by the entire transaction.
   */
  gasUsed: GasUsed;
  /**
   * Code the tx was reverted (or OK).
   */
  revertCode: RevertCode;
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

export function makeProcessedTxFromPrivateOnlyTx(
  tx: Tx,
  transactionFee: Fr,
  feePaymentPublicDataWrite: PublicDataWrite,
  globalVariables: GlobalVariables,
): ProcessedTx {
  const data = tx.data.forRollup!;
  const txEffect = new TxEffect(
    RevertCode.OK,
    tx.getTxHash(),
    transactionFee,
    data.end.noteHashes.filter(h => !h.isZero()),
    data.end.nullifiers.filter(h => !h.isZero()),
    data.end.l2ToL1Msgs
      .filter(msg => !msg.contractAddress.isZero())
      .map(msg =>
        computeL2ToL1MessageHash({
          l2Sender: msg.contractAddress,
          l1Recipient: msg.message.recipient,
          content: msg.message.content,
          rollupVersion: globalVariables.version,
          chainId: globalVariables.chainId,
        }),
      ),
    [feePaymentPublicDataWrite],
    data.end.privateLogs.filter(l => !l.isEmpty()),
    [],
    tx.getContractClassLogs(),
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
    chonkProof: tx.chonkProof,
    avmProvingRequest: undefined,
    globalVariables,
    txEffect,
    gasUsed,
    revertCode: RevertCode.OK,
    revertReason: undefined,
  };
}

export function makeProcessedTxFromTxWithPublicCalls(
  tx: Tx,
  globalVariables: GlobalVariables,
  avmProvingRequest: AvmProvingRequest | undefined,
  publicTxEffect: PublicTxEffect,
  gasUsed: GasUsed,
  revertCode: RevertCode,
  revertReason: SimulationError | undefined,
): ProcessedTx {
  const privateLogs = [
    ...tx.data.forPublic!.nonRevertibleAccumulatedData.privateLogs,
    ...(revertCode.isOK() ? tx.data.forPublic!.revertibleAccumulatedData.privateLogs : []),
  ].filter(l => !l.isEmpty());

  const contractClassLogs = revertCode.isOK()
    ? tx.getContractClassLogs()
    : tx.getSplitContractClassLogs(false /* revertible */);

  const txEffect = new TxEffect(
    revertCode,
    tx.getTxHash(),
    publicTxEffect.transactionFee,
    publicTxEffect.noteHashes,
    publicTxEffect.nullifiers,
    publicTxEffect.l2ToL1Msgs // convert messages to hashes.
      .filter(msg => !msg.contractAddress.isZero())
      .map(msg =>
        computeL2ToL1MessageHash({
          l2Sender: msg.contractAddress,
          l1Recipient: msg.message.recipient,
          content: msg.message.content,
          rollupVersion: globalVariables.version,
          chainId: globalVariables.chainId,
        }),
      ),
    publicTxEffect.publicDataWrites,
    privateLogs,
    publicTxEffect.publicLogs,
    contractClassLogs,
  );

  // Some callers expect a revert reason if the tx reverted.
  const finalRevertReason =
    revertReason === undefined && !revertCode.isOK()
      ? new SimulationError('TX reverted', /*functionErrorStack=*/ [], /*revertData=*/ [])
      : revertReason;

  return {
    hash: txEffect.txHash,
    data: tx.data,
    chonkProof: tx.chonkProof,
    avmProvingRequest,
    globalVariables,
    txEffect,
    gasUsed,
    revertCode,
    revertReason: finalRevertReason,
  };
}
