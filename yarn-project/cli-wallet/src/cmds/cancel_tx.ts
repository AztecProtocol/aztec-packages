import { type AccountWalletWithSecretKey, type FeePaymentMethod, SentTx, type TxHash, TxStatus } from '@aztec/aztec.js';
import type { FeeOptions } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';

export async function cancelTx(
  wallet: AccountWalletWithSecretKey,
  {
    txHash,
    gasSettings: prevTxGasSettings,
    txNonce,
    cancellable,
  }: { txHash: TxHash; gasSettings: GasSettings; txNonce: Fr; cancellable: boolean },
  paymentMethod: FeePaymentMethod,
  increasedFees: GasFees,
  maxFeesPerGas: GasFees | undefined,
  log: LogFn,
) {
  const receipt = await wallet.getTxReceipt(txHash);
  if (receipt.status !== TxStatus.PENDING || !cancellable) {
    log(`Transaction is in status ${receipt.status} and cannot be cancelled`);
    return;
  }

  const maxPriorityFeesPerGas = new GasFees(
    prevTxGasSettings.maxPriorityFeesPerGas.feePerDaGas + increasedFees.feePerDaGas,
    prevTxGasSettings.maxPriorityFeesPerGas.feePerL2Gas + increasedFees.feePerL2Gas,
  );

  const fee: FeeOptions = {
    paymentMethod,
    gasSettings: GasSettings.from({
      ...prevTxGasSettings,
      maxPriorityFeesPerGas,
      maxFeesPerGas: maxFeesPerGas ?? prevTxGasSettings.maxFeesPerGas,
    }),
  };

  const txRequest = await wallet.createTxExecutionRequest(ExecutionPayload.empty(), fee, {
    txNonce,
    cancellable: true,
  });
  const txSimulationResult = await wallet.simulateTx(txRequest, true);
  const txProvingResult = await wallet.proveTx(txRequest, txSimulationResult.privateExecutionResult);
  const sentTx = new SentTx(wallet, () => wallet.sendTx(txProvingResult.toTx()));
  try {
    await sentTx.wait({ timeout: DEFAULT_TX_TIMEOUT_S });

    log('Transaction has been cancelled');

    const cancelReceipt = await sentTx.getReceipt();
    log(` Tx fee: ${cancelReceipt.transactionFee}`);
    log(` Status: ${cancelReceipt.status}`);
    log(` Block number: ${cancelReceipt.blockNumber}`);
    log(` Block hash: ${cancelReceipt.blockHash?.toString()}`);
  } catch (err: any) {
    log(`Could not cancel transaction\n ${err.message}`);
  }
}
