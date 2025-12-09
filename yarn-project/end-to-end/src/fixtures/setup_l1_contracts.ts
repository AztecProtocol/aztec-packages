import type { Logger } from '@aztec/aztec.js/log';
import {
  type DeployAztecL1ContractsArgs,
  type ForgeDeployAztecL1ContractsReturnType,
  type L1ContractsConfig,
  RollupContract,
  deployAztecL1Contracts,
  isAnvilTestChain,
} from '@aztec/ethereum';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import type { Hex } from 'viem';
import { foundry } from 'viem/chains';

/**
 * Helper to emit structured JSON logs for deployment tracking.
 * Matches the logging format used in TypeScript deployment for comparison.
 */
function logJson(logger: Logger, data: Record<string, unknown>) {
  logger.info(JSON.stringify({ ...data, timestamp: new Date().toISOString() }));
}

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

export const setupL1Contracts = async (
  l1RpcUrl: string,
  privateKey: Hex,
  logger: Logger,
  args: Pick<DeployAztecL1ContractsArgs, 'genesisArchiveRoot' | 'initialValidators'> & L1ContractsConfig,
) => {
  const l1Data = await deployAztecL1Contracts(l1RpcUrl, privateKey, foundry, logger, {
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
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
 * Note: Unlike setupL1Contracts which accepts an account object, this function requires
 * a private key directly because the underlying forge script needs it and viem's
 * PrivateKeyAccount doesn't expose the private key after creation (security feature).
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
  args: DeployAztecL1ContractsArgs,
): Promise<ForgeDeployAztecL1ContractsReturnType> => {
  const l1Data = await deployAztecL1Contracts(l1RpcUrl, privateKey, foundry, logger, args);

  // Create a Rollup contract instance for querying state
  const rollup = new RollupContract(l1Data.l1Client, l1Data.l1ContractAddresses.rollupAddress.toString());

  // Log genesis time and current L1 state after forge deployment
  const [genesisTime, postForgeBlock] = await Promise.all([rollup.getL1GenesisTime(), l1Data.l1Client.getBlock()]);

  logJson(logger, {
    type: 'forge_deployment_complete',
    rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
    registryAddress: l1Data.l1ContractAddresses.registryAddress.toString(),
    rollupVersion: l1Data.rollupVersion,
    genesisTime: genesisTime.toString(),
    l1BlockNumber: postForgeBlock.number.toString(),
    l1BlockTimestamp: postForgeBlock.timestamp.toString(),
  });

  logger.info('L1 contracts deployed via forge', {
    rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
    registryAddress: l1Data.l1ContractAddresses.registryAddress.toString(),
    rollupVersion: l1Data.rollupVersion,
  });

  // Jump to slot 1 to avoid the edge case where genesis block occupies slot 0
  // This matches the behavior of the TypeScript deployment (see deploy_l1_contracts.ts)
  if (isAnvilTestChain(foundry.id)) {
    try {
      const currentSlot = await rollup.getSlotNumber();
      if (currentSlot === 0) {
        const ts = Number(await rollup.getTimestampForSlot(SlotNumber(1)));
        await l1Data.l1Client.transport.request({ method: 'evm_setNextBlockTimestamp', params: [ts] });
        await l1Data.l1Client.transport.request({ method: 'hardhat_mine', params: [1] });
        const newSlot = await rollup.getSlotNumber();
        if (newSlot !== 1) {
          throw new Error(`Error jumping time: current slot is ${newSlot}`);
        }
        logger.info('Jumped to slot 1');
      }
    } catch (e) {
      throw new Error(`Error jumping time: ${e}`);
    }
  }
  return l1Data;
};
