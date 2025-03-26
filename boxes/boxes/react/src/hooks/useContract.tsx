import { useState } from 'react';
import { deployerEnv } from '../config';

import { Contract, Fr } from '@aztec/aztec.js';
import { toast } from 'react-toastify';

export function useContract() {
  const [wait, setWait] = useState(false);
  const [contract, setContract] = useState<Contract | undefined>();

  const deploy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setWait(true);
    const wallet = await deployerEnv.getWallet();
    const salt = Fr.random();

    const { BoxReactContract } = await import('../../artifacts/BoxReact');

    const tx = await BoxReactContract.deploy(wallet, Fr.random(), wallet.getCompleteAddress().address).send({
      contractAddressSalt: salt,
    });
    const contract = await toast.promise(tx.deployed(), {
      pending: 'Deploying contract...',
      success: {
        render: ({ data }) => `Address: ${data.address}`,
      },
      error: 'Error deploying contract',
    });

    setContract(contract);
    setWait(false);
  };

  return { deploy, contract, wait };
}
