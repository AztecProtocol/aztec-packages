import type { ExecutionPayload } from '@aztec/entrypoints/interfaces';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getDeployerContract } from '../contract/protocol_contracts.js';
import { Fr, FunctionSelector, FunctionType } from '../index.js';
import type { Wallet } from '../wallet/index.js';

/**
 * Sets up a call to the canonical deployer contract to publicly deploy a contract instance.
 * @param wallet - The wallet to use for the deployment.
 * @param instance - The instance to deploy.
 */
export async function deployInstance(wallet: Wallet, instance: ContractInstanceWithAddress): Promise<ExecutionPayload> {
  const deployerContract = await getDeployerContract(wallet);
  const { salt, currentContractClassId: contractClassId, publicKeys, deployer } = instance;
  const isUniversalDeploy = deployer.isZero();
  if (!isUniversalDeploy && !wallet.getAddress().equals(deployer)) {
    throw new Error(
      `Expected deployer ${deployer.toString()} does not match sender wallet ${wallet.getAddress().toString()}`,
    );
  }
  return {
    calls: [
      {
        name: 'deploy',
        to: deployerContract.address,
        selector: await FunctionSelector.fromSignature('deploy(Field,(Field),Field,-,boolean)'),
        args: [
          salt,
          contractClassId,
          instance.initializationHash,
          ...publicKeys.toFields(),
          isUniversalDeploy ? Fr.ONE : Fr.ZERO,
        ],
        type: FunctionType.PRIVATE,
        isStatic: false,
        returnTypes: [],
      },
    ],
    authWitnesses: [],
    capsules: [],
  };
}
