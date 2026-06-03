import { useState } from 'react';
import { Contract } from '@aztec/aztec.js/contracts';
import { TxStatus } from '@aztec/aztec.js/tx';
import { toast } from 'react-toastify';
import { deployerEnv } from '../config';

export function useNumber({ contract }: { contract: Contract }) {
  const [wait, setWait] = useState(false);

  const getNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setWait(true);
    const defaultAccountAddress = deployerEnv.getDefaultAccountAddress();
    const { result } = await contract!.methods
      .getNumber(defaultAccountAddress)
      .simulate({ from: defaultAccountAddress });
    toast(`Number is: ${result}`);
    setWait(false);
  };

  const setNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const el = e.currentTarget.elements.namedItem('numberToSet') as HTMLInputElement;
    if (el) {
      setWait(true);

      const value = BigInt(el.value);
      const defaultAccountAddress = deployerEnv.getDefaultAccountAddress();
      await toast.promise(
        // PROPOSED (the wallet default) is flaky in boxes CI, so wait for the checkpoint.
        contract!.methods
          .setNumber(value, defaultAccountAddress)
          .send({ from: defaultAccountAddress, wait: { waitForStatus: TxStatus.CHECKPOINTED } }),
        {
          pending: 'Setting number...',
          success: `Number set to: ${value}`,
          error: 'Error setting number',
        },
      );
      setWait(false);
    }
  };

  return { getNumber, setNumber, wait };
}
