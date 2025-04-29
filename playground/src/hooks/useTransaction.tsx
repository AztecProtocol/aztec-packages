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

export function useTransaction() {
  const { walletDB, currentTx, setCurrentTx, transactionModalStatus, setTransactionModalStatus } = useContext(AztecContext);
  const notifications = useNotifications();

  async function sendTx(
    name: string,
    interaction: ContractFunctionInteraction | DeployMethod,
    contractAddress: AztecAddress,
    opts: SendMethodOptions | DeployOptions,
    displayOptions?: {
      openPopup?: boolean;
      showNotification?: boolean;
    },
  ): Promise<boolean> {

    let receipt;
    let txHash;
    const tx = {
      status: 'proving' as const,
      name,
      contractAddress,
    };
    const modalStatus = (displayOptions?.openPopup ?? false) ? 'open' : 'minimized';
    const showNotification = (displayOptions?.showNotification ?? true) && (transactionModalStatus === 'minimized');

    setCurrentTx(tx);
    setTransactionModalStatus(modalStatus);

    try {
      notifications.show('Proving transaction...', {
        severity: 'info',
      });
      const provenInteraction = await interaction.prove(opts);

      if (showNotification) {
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
      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true, timeout: 180 });

      if (showNotification && receipt.status === TxStatus.SUCCESS) {
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
      setTransactionModalStatus('closed');
    } catch (e) {
      if (e instanceof TimeoutError) {
        await walletDB.storeTx({
          contractAddress,
          txHash,
          name,
          receipt: new TxReceipt(txHash, TxStatus.PENDING, e.message),
        });

        setCurrentTx(null);

        return false;
      }

      console.error('Transaction failed with error:', e);
      if (showNotification) {
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
    return receipt && receipt.status === TxStatus.SUCCESS;
  }

  return { sendTx };
}
