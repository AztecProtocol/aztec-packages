import {
  AztecAddress,
  type FeePaymentMethod,
  type InteractionFeeOptions,
  SentTx,
  type TxHash,
  TxStatus,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function cancelTx(
  wallet: CLIWallet,
  from: AztecAddress,
  {
    txHash,
    gasSettings: prevTxGasSettings,
    txNonce,
    cancellable,
  }: {
    txHash: TxHash;
    gasSettings: GasSettings;
    txNonce: Fr;
    cancellable: boolean;
  },
  paymentMethod: FeePaymentMethod | undefined,
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

  const feeOptions: InteractionFeeOptions = {
    paymentMethod,
    gasSettings: GasSettings.from({
      ...prevTxGasSettings,
      maxPriorityFeesPerGas,
      maxFeesPerGas: maxFeesPerGas ?? prevTxGasSettings.maxFeesPerGas,
    }),
  };

  const txProvingResult = await wallet.proveCancellationTx(from, txNonce, feeOptions);
  const sentTx = new SentTx(wallet, async () => {
    const tx = await txProvingResult.toTx();
    return wallet.sendTx(tx);
  });
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
