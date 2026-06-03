import { useState } from 'react';
import { Contract } from '@aztec/aztec.js/contracts';
import { toast } from 'react-toastify';
import { deployerEnv } from '../config';

export function useNumber({ contract }: { contract: Contract }) {
  const [wait, setWait] = useState(false);

  const getNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setWait(true);
    try {
      const defaultAccountAddress = deployerEnv.getDefaultAccountAddress();
      const { result } = await contract!.methods
        .getNumber(defaultAccountAddress)
        .simulate({ from: defaultAccountAddress });
      const value = typeof result === 'object' && result !== null && 'value' in result ? result.value : result;
      toast(`Number is: ${value}`);
    } finally {
      setWait(false);
    }
  };

  const setNumber = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const el = e.currentTarget.elements.namedItem('numberToSet') as HTMLInputElement;
    if (el) {
      setWait(true);
      try {
        const value = BigInt(el.value);
        const defaultAccountAddress = deployerEnv.getDefaultAccountAddress();
        await toast.promise(
          contract!.methods.setNumber(value, defaultAccountAddress).send({ from: defaultAccountAddress }),
          {
            pending: 'Setting number...',
            success: `Number set to: ${value}`,
            error: 'Error setting number',
          },
        );
      } finally {
        setWait(false);
      }
    }
  };

  return { getNumber, setNumber, wait };
}
