import type { ContractInstanceWithAddress } from '@aztec/circuits.js/contract';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { Wallet } from '../wallet/index.js';
import { getDeployerContract } from './protocol_contracts.js';

/**
 * Sets up a call to the canonical deployer contract to publicly deploy a contract instance.
 * @param wallet - The wallet to use for the deployment.
 * @param instance - The instance to deploy.
 */
export async function deployInstance(
  wallet: Wallet,
  instance: ContractInstanceWithAddress,
): Promise<ContractFunctionInteraction> {
  const deployerContract = await getDeployerContract(wallet);
  const { salt, currentContractClassId: contractClassId, publicKeys, deployer } = instance;
  const isUniversalDeploy = deployer.isZero();
  if (!isUniversalDeploy && !wallet.getAddress().equals(deployer)) {
    throw new Error(
      `Expected deployer ${deployer.toString()} does not match sender wallet ${wallet.getAddress().toString()}`,
    );
  }
  return deployerContract.methods.deploy(
    salt,
    contractClassId,
    instance.initializationHash,
    publicKeys,
    isUniversalDeploy,
  );
}
