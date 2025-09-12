import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getInstanceRegistryContract } from '../contract/protocol_contracts.js';
import type { Wallet } from '../wallet/wallet.js';

/**
 * Sets up a call to the canonical contract instance registry to publish a contract instance.
 * @param wallet - The wallet to use for the publication (setup) tx.
 * @param instance - The instance to publish.
 */
export async function publishInstance(
  wallet: Wallet,
  instance: ContractInstanceWithAddress,
): Promise<ContractFunctionInteraction> {
  const contractInstanceRegistry = await getInstanceRegistryContract(wallet);
  const { salt, currentContractClassId: contractClassId, publicKeys, deployer: instanceDeployer } = instance;
  const isUniversalDeploy = instanceDeployer.isZero();
  return contractInstanceRegistry.methods.publish_for_public_execution(
    salt,
    contractClassId,
    instance.initializationHash,
    publicKeys,
    isUniversalDeploy,
  );
}
