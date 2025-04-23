import { useContext, useState } from 'react';
import { AztecContext } from '../aztecEnv';
import {
  TxStatus,
  type AztecAddress,
  type ContractFunctionInteraction,
  type DeployMethod,
  type DeployOptions,
  type SendMethodOptions,
} from '@aztec/aztec.js';
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
    const modalStatus = (displayOptions?.openPopup ?? true) ? 'open' : 'minimized';
    const showNotification = (displayOptions?.showNotification ?? true) && (transactionModalStatus === 'minimized');

    setCurrentTx(tx);
    setTransactionModalStatus(modalStatus);

    try {
      notifications.show('Proving transaction...');
      const provenInteraction = await interaction.prove(opts);

      if (showNotification) {
        notifications.show('Proof generated successfully, sending transaction...');
      }

      txHash = await provenInteraction.getTxHash();
      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });

      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true, timeout: 120 });
      if (showNotification) {
        notifications.show('Transaction mined successfully.');
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
