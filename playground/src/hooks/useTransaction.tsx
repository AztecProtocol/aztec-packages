import { useContext, useState } from 'react';
import { AztecContext } from '../aztecEnv';
import type {
  AztecAddress,
  ContractFunctionInteraction,
  DeployMethod,
  DeployOptions,
  SendMethodOptions,
} from '@aztec/aztec.js';

export function useTransaction() {
  const { walletDB, currentTx, setCurrentTx } = useContext(AztecContext);

  async function sendTx(
    name: string,
    interaction: ContractFunctionInteraction | DeployMethod,
    contractAddress: AztecAddress,
    opts: SendMethodOptions | DeployOptions,
  ) {
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
      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true });
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
  }

  return { currentTx, sendTx };
}
