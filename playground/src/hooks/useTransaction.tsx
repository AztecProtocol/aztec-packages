import { useContext } from 'react';
import { AztecContext } from '../aztecEnv';
import {
  TxReceipt,
  TxStatus,
  type AztecAddress,
  type ContractFunctionInteraction,
  type DeployMethod,
  type DeployOptions,
  type SendMethodOptions,
} from '@aztec/aztec.js';
import { TimeoutError } from '@aztec/foundation/error';
import { useNotifications } from '@toolpad/core/useNotifications';
import { TX_TIMEOUT } from '../constants';

export function useTransaction() {
  const { walletDB, currentTx, setCurrentTx } = useContext(AztecContext);
  const notifications = useNotifications();

  async function sendTx(
    name: string,
    interaction: ContractFunctionInteraction | DeployMethod,
    contractAddress: AztecAddress,
    opts: SendMethodOptions | DeployOptions,
    displayOptions?: {
      showNotifications?: boolean;
    },
  ): Promise<TxReceipt> {
    let receipt;
    let txHash;
    const tx = {
      status: 'proving' as const,
      name,
      contractAddress,
    };
    const showNotifications = displayOptions?.showNotifications ?? true;

    setCurrentTx(tx);

    try {
      notifications.show('Proving transaction...', {
        severity: 'info',
      });
      const provenInteraction = await interaction.prove(opts);

      if (showNotifications) {
        notifications.show('Proof generated successfully, sending transaction...', {
          severity: 'success',
        });
      }

      txHash = await provenInteraction.getTxHash();
      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });

      // TODO: Don't send the tx if the user has cancelled the transaction
      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true, timeout: TX_TIMEOUT, interval: 5 });

      if (showNotifications && receipt.status === TxStatus.SUCCESS) {
        notifications.show('Congratulations! Your transaction was included in a block.', {
          severity: 'success',
        });
      }

      await walletDB.storeTx({
        contractAddress,
        txHash,
        name,
        receipt,
      });

      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: receipt.status,
          receipt,
          error: receipt.error,
        },
      });
    } catch (e) {
      if (e instanceof TimeoutError) {
        const txReceipt = new TxReceipt(txHash, TxStatus.PENDING, e.message);
        await walletDB.storeTx({
          contractAddress,
          txHash,
          name,
          receipt: txReceipt,
        });

        setCurrentTx(null);

        return txReceipt;
      }

      console.error('Transaction failed with error:', e);
      if (showNotifications) {
        notifications.show(`Transaction failed with error: ${e.message}`, {
          severity: 'error',
        });
      }

      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: 'error',
          error: e.message,
        },
      });
    }

    return receipt;
  }

  return { sendTx };
}
