import { type AccountWalletWithSecretKey, type FeePaymentMethod, SentTx, type TxHash, TxStatus } from '@aztec/aztec.js';
import { type FeeOptions } from '@aztec/aztec.js/entrypoint';
import { type Fr, type GasSettings } from '@aztec/circuits.js';
import { type LogFn } from '@aztec/foundation/log';

export async function cancelTx(
  wallet: AccountWalletWithSecretKey,
  {
    txHash,
    gasSettings,
    nonce,
    cancellable,
  }: { txHash: TxHash; gasSettings: GasSettings; nonce: Fr; cancellable: boolean },
  paymentMethod: FeePaymentMethod,
  log: LogFn,
) {
  const receipt = await wallet.getTxReceipt(txHash);
  if (receipt.status !== TxStatus.PENDING || !cancellable) {
    log(`Transaction is in status ${receipt.status} and cannot be cancelled`);
    return;
  }

  const fee: FeeOptions = {
    paymentMethod,
    gasSettings,
  };

  // TODO(#9805): Increase max_priority_fee_per_gas.

  const txRequest = await wallet.createTxExecutionRequest({
    calls: [],
    fee,
    nonce,
    cancellable: true,
  });
  const txSimulationResult = await wallet.simulateTx(txRequest, true);
  const txProvingResult = await wallet.proveTx(txRequest, txSimulationResult.privateExecutionResult);
  const sentTx = new SentTx(wallet, wallet.sendTx(txProvingResult.toTx()));
  try {
    await sentTx.wait();

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
