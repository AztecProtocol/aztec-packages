import { pxe } from '../config.js';
import { Contract } from './contract.js';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from './hooks/useAccounts.js';
import { convertArgs } from '../scripts/util.js';
import { AztecAddress, CompleteAddress, ContractArtifact, DeployMethod, Fr, PXE } from '@aztec/aztec.js';
import { useContract } from './hooks/useContract.js';

export function Home() {
  const [deploymentAccount, setDeploymentAccount] = useState<CompleteAddress>();
  const accounts = useAccount();
  const { deploy, contract } = useContract({ deployer: deploymentAccount });

  const selectWallet = ({ currentTarget }: React.FormEvent<HTMLSelectElement>) => {
    if (!accounts) return;
    const index = parseInt(currentTarget.value);
    setDeploymentAccount(accounts[index]);
  };

  if (!contract) {
    return (
      <form onSubmit={deploy}>
        <label htmlFor="accounts">Choose a wallet to deploy dummy contract:</label>
        <select name="accounts" id="accounts" onChange={selectWallet}>
          {accounts?.map((acc, index) => (
            <option key={index} value={index}>
              {acc.address.toShortString()}
            </option>
          ))}
        </select>
        <button type="submit">Deploy dummy contract</button>
      </form>
    );
  }

  return <Contract address={contract} />;
}
