import type { Logger } from '@aztec/aztec.js/log';
import {
  type DeployL1ContractsArgs,
  type L1ContractsConfig,
  deployL1Contracts,
  setupL1ContractsViaForge,
} from '@aztec/ethereum';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import type { HDAccount, PrivateKeyAccount } from 'viem';
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
 * Setup L1 contracts using forge deployment scripts.
 * This is an alternative to the TypeScript-based deployment that uses forge scripts
 * which are more production-like and match the ignition-monorepo deployment pattern.
 *
 * @param l1RpcUrl - The RPC URL to connect to
 * @param privateKey - The private key for the deployer (with 0x prefix)
 * @param logger - Logger instance
 * @param genesisArchiveRoot - The genesis archive root (required for proper block validation)
 * @returns The deployed contract addresses and client
 */
export const setupL1ContractsWithForge = async (
  l1RpcUrl: string,
  privateKey: `0x${string}`,
  logger: Logger,
  genesisArchiveRoot?: `0x${string}`,
) => {
  const vkTreeRoot = getVKTreeRoot();

  logger.info('Deploying L1 contracts via forge script', {
    vkTreeRoot: vkTreeRoot.toString(),
    protocolContractsHash: protocolContractsHash.toString(),
  });

  const l1Data = await setupL1ContractsViaForge(l1RpcUrl, privateKey, {
    vkTreeRoot: vkTreeRoot.toString(),
    protocolContractsHash: protocolContractsHash.toString(),
    genesisArchiveRoot,
    logger,
    chain: foundry,
  });

  logger.info('L1 contracts deployed via forge', {
    rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
    registryAddress: l1Data.l1ContractAddresses.registryAddress.toString(),
    rollupVersion: l1Data.rollupVersion,
  });

  return l1Data;
};
