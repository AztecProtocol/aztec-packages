import { useState } from 'react';
import { Contract } from '@aztec/aztec.js';
import { toast } from 'react-toastify';
import { deployerEnv } from '../config';

export function useNumber({ contract }: { contract: Contract }) {
  const [wait, setWait] = useState(false);

  const getNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setWait(true);
    const deployerWallet = await deployerEnv.getWallet();
    const viewTxReceipt = await contract!.methods.getNumber(deployerWallet.getCompleteAddress()).view();
    toast(`Number is: ${viewTxReceipt.value}`);
    setWait(false);
  };

  const setNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const el = e.currentTarget.elements.namedItem('numberToSet') as HTMLInputElement;
    if (el) {
      setWait(true);

      const value = BigInt(el.value);
      const deployerWallet = await deployerEnv.getWallet();
      await toast.promise(contract!.methods.setNumber(value, deployerWallet.getCompleteAddress()).send().wait(), {
        pending: 'Setting number...',
        success: `Number set to: ${value}`,
        error: 'Error setting number',
      });
      setWait(false);
    }
  };

  return { getNumber, setNumber, wait };
}
