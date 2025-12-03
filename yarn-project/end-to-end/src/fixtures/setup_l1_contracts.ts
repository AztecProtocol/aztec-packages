import type { Logger } from '@aztec/aztec.js/log';
import {
  type DeployL1ContractsArgs,
  type ForgeDeploymentOptions,
  type L1ContractsConfig,
  L1Deployer,
  type Operator,
  type ZKPassportArgs,
  addMultipleValidators,
  deployL1Contracts,
  setupL1ContractsViaForge,
} from '@aztec/ethereum';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import type { HDAccount, Hex, PrivateKeyAccount } from 'viem';
import { foundry } from 'viem/chains';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

export const setupL1Contracts = async (
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: Logger,
  args: Pick<DeployL1ContractsArgs, 'genesisArchiveRoot' | 'initialValidators'> & L1ContractsConfig,
) => {
  const l1Data = await deployL1Contracts([l1RpcUrl], account, foundry, logger, {
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
    salt: undefined,
    realVerifier: false,
    ...args,
  });

  return l1Data;
};

/**
 * Options for forge-based L1 deployment in e2e tests.
 */
export interface SetupL1ContractsWithForgeOptions {
  /** Genesis archive root (required for proper block validation) */
  genesisArchiveRoot?: `0x${string}`;
  /** Use real verifier (HonkVerifier) instead of MockVerifier */
  realVerifier?: boolean;
  /** Fund the reward distributor with tokens */
  fundRewardDistributor?: boolean;
  /** Additional forge deployment options (new nested format) */
  forgeOptions?: Partial<Omit<ForgeDeploymentOptions, 'chain' | 'logger'>>;
  /** Initial validators to register (with BLS keys) */
  initialValidators?: (Operator & { privateKey?: `0x${string}` })[];
  /** ZkPassport configuration (domain, scope, mock verifier) */
  zkPassportArgs?: ZKPassportArgs;
}

/**
 * Setup L1 contracts using forge deployment scripts.
 * This is an alternative to the TypeScript-based deployment that uses forge scripts
 * which are more production-like and match the ignition-monorepo deployment pattern.
 *
 * @param l1RpcUrl - The RPC URL to connect to
 * @param privateKey - The private key for the deployer (with 0x prefix)
 * @param logger - Logger instance
 * @param options - Deployment options including genesisArchiveRoot, realVerifier, etc.
 * @returns The deployed contract addresses and client
 */
export const setupL1ContractsWithForge = async (
  l1RpcUrl: string,
  privateKey: `0x${string}`,
  logger: Logger,
  options: SetupL1ContractsWithForgeOptions = {},
) => {
  const vkTreeRoot = getVKTreeRoot();

  logger.info('Deploying L1 contracts via forge script', {
    vkTreeRoot: vkTreeRoot.toString(),
    protocolContractsHash: protocolContractsHash.toString(),
    realVerifier: options.realVerifier ?? false,
    fundRewardDistributor: options.fundRewardDistributor ?? true,
  });

  // Build stakingAssetHandler config, merging zkPassportArgs with any provided forgeOptions
  // Note: mockZkPassportVerifier is not needed here - the forge script always deploys MockZkPassportVerifier
  const stakingAssetHandler = {
    ...options.forgeOptions?.stakingAssetHandler,
    ...(options.zkPassportArgs?.zkPassportDomain && { zkPassportDomain: options.zkPassportArgs.zkPassportDomain }),
    ...(options.zkPassportArgs?.zkPassportScope && { zkPassportScope: options.zkPassportArgs.zkPassportScope }),
  };

  const l1Data = await setupL1ContractsViaForge(l1RpcUrl, privateKey, {
    logger,
    chain: foundry,
    config: {
      genesis: {
        vkTreeRoot: BigInt(vkTreeRoot.toString()).toString(),
        protocolContractsHash: BigInt(protocolContractsHash.toString()).toString(),
        genesisArchiveRoot: options.genesisArchiveRoot ? BigInt(options.genesisArchiveRoot).toString() : undefined,
      },
      deployment: {
        useMockVerifier: !(options.realVerifier ?? false),
        fundRewardDistributor: options.fundRewardDistributor,
      },
      ...options.forgeOptions?.config,
    },
    stakingAssetHandler: Object.keys(stakingAssetHandler).length > 0 ? stakingAssetHandler : undefined,
  });

  logger.info('L1 contracts deployed via forge', {
    rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
    registryAddress: l1Data.l1ContractAddresses.registryAddress.toString(),
    rollupVersion: l1Data.rollupVersion,
  });

  // Add initial validators if provided (needed for slashing tests with BLS keys)
  if (options.initialValidators && options.initialValidators.length > 0) {
    const gseAddress = l1Data.l1ContractAddresses.gseAddress;
    const stakingAssetAddress = l1Data.l1ContractAddresses.stakingAssetAddress;

    if (!gseAddress || !stakingAssetAddress) {
      throw new Error('GSE and staking asset addresses are required for adding validators');
    }

    logger.info(`Adding ${options.initialValidators.length} initial validators after forge deployment`);

    const deployer = new L1Deployer(l1Data.l1Client, undefined, undefined, true, logger);

    await addMultipleValidators(
      l1Data.l1Client,
      deployer,
      gseAddress.toString() as Hex,
      l1Data.l1ContractAddresses.rollupAddress.toString() as Hex,
      stakingAssetAddress.toString() as Hex,
      options.initialValidators,
      true, // acceleratedTestDeployments
      logger,
    );

    logger.info('Initial validators added successfully');
  }

  return l1Data;
};
