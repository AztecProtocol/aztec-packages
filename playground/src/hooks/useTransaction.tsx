import { useContext } from 'react';
import { AztecContext } from '../aztecContext';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  ContractFunctionInteraction,
  DeployMethod,
  type InteractionWaitOptions,
  type SendInteractionOptions,
  type DeployOptions,
  NO_WAIT,
} from '@aztec/aztec.js/contracts';
import { TxHash, TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import { TimeoutError } from '@aztec/foundation/error';
import { useNotifications } from '@toolpad/core/useNotifications';
import { TX_TIMEOUT } from '../constants';
import { waitForTx } from '@aztec/aztec.js/node';

export function useTransaction() {
  const { playgroundDB, currentTx, setCurrentTx, node } = useContext(AztecContext);
  const notifications = useNotifications();

  async function sendTx<W extends InteractionWaitOptions>(
    name: string,
    interaction: ContractFunctionInteraction | DeployMethod,
    contractAddress: AztecAddress,
    opts: SendInteractionOptions<W> | DeployOptions<W>,
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
      notifications.show('Sending transaction...', {
        severity: 'info',
      });
      let txHash: TxHash;

      if (interaction instanceof DeployMethod) {
        const { from, fee, ...deployOpts } = opts as DeployOptions<W>;
        txHash = await interaction.send({ from, fee, ...deployOpts, wait: NO_WAIT });
      } else {
        const { from, fee, authWitnesses, capsules } = opts as SendInteractionOptions<W>;
        txHash = await interaction.send({ from, fee, authWitnesses, capsules, wait: NO_WAIT });
      }

      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });

      // TODO: Don't send the tx if the user has cancelled the transaction
      receipt = await waitForTx(node, txHash, { dontThrowOnRevert: true, timeout: TX_TIMEOUT, interval: 5 });

      if (showNotifications && receipt.hasExecutionSucceeded()) {
        notifications.show('Congratulations! Your transaction was included in a block.', {
          severity: 'success',
        });
      }

      await playgroundDB.storeTx({
        contractAddress,
        txHash,
        name,
        receipt,
      });

      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: receipt.hasExecutionSucceeded() ? 'success' : receipt.status,
          receipt,
          error: receipt.error,
        },
      });
    } catch (e) {
      if (e instanceof TimeoutError) {
        const txReceipt = new TxReceipt(txHash, TxStatus.PENDING, undefined, e.message);
        await playgroundDB.storeTx({
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
