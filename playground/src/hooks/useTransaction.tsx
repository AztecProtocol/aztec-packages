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

export function useTransaction() {
  const { walletDB, currentTx, setCurrentTx } = useContext(AztecContext);

  async function sendTx(
    name: string,
    interaction: ContractFunctionInteraction | DeployMethod,
    contractAddress: AztecAddress,
    opts: SendMethodOptions | DeployOptions,
  ): Promise<boolean> {
    let receipt;
    let txHash;
    const tx = {
      status: 'proving' as const,
      name,
      contractAddress,
    };
    setCurrentTx(tx);
    try {
      const provenInteraction = await interaction.prove(opts);
      txHash = await provenInteraction.getTxHash();
      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });
      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true, timeout: 120 });
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
