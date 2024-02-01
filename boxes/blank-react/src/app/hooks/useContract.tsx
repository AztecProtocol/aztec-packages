import { useState } from 'react';
import { contractArtifact, pxe } from '../../config.js';

import { convertArgs } from '../../scripts/util.js';
import { AztecAddress, CompleteAddress, Contract, DeployMethod, Fr } from '@aztec/aztec.js';

export function useContract({ deployer }: { deployer: CompleteAddress | undefined }) {
  const [contract, setContract] = useState<AztecAddress | undefined>();

  const deploy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!deployer) return;

    const salt = Fr.random();
    const functionAbi = contractArtifact.functions.find(f => f.name === 'constructor')!;
    const typedArgs: any[] = convertArgs(functionAbi, []);

    const tx = new DeployMethod(
      deployer.publicKey,
      pxe.getPxe(),
      contractArtifact,
      (a, w) => Contract.at(a, contractArtifact, w),
      typedArgs,
    ).send({
      contractAddressSalt: salt,
    });

    const receipt = await tx.wait();
    setContract(receipt.contractAddress);
  };

  return { deploy, contract };
}
