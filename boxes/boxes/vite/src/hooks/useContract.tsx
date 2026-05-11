import { useState } from 'react';
import { deployerEnv } from '../config';

import { Contract } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { toast } from 'react-toastify';

export function useContract() {
  const [wait, setWait] = useState(false);
  const [contract, setContract] = useState<Contract | undefined>();

  const deploy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setWait(true);
    const wallet = await deployerEnv.getWallet();
    const defaultAccountAddress = deployerEnv.getDefaultAccountAddress();

    const { BoxReactContract } = await import('../../artifacts/BoxReact');

    const deploymentPromise = BoxReactContract.deploy(wallet, Fr.random(), defaultAccountAddress).send({
      from: defaultAccountAddress,
    });

    const { contract } = await toast.promise(deploymentPromise, {
      pending: 'Deploying contract...',
      success: {
        render: ({ data }) => `Address: ${data.contract.address}`,
      },
      error: 'Error deploying contract',
    });

    setContract(contract);
    setWait(false);
  };

  return { deploy, contract, wait };
}
