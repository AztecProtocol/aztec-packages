import type { Logger } from '@aztec/aztec.js/log';
import {
  type DeployL1ContractsArgs,
  type L1ContractsConfig,
  type Operator,
  RollupContract,
  type ZKPassportArgs,
  deployL1Contracts,
  isAnvilTestChain,
  setupL1ContractsViaForge,
} from '@aztec/ethereum';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import type { HDAccount, PrivateKeyAccount } from 'viem';
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
 * Includes all L1ContractsConfig options that should be passed to the forge script.
 */
export interface SetupL1ContractsWithForgeOptions extends Partial<L1ContractsConfig> {
  /** Genesis archive root (required for proper block validation) */
  genesisArchiveRoot?: `0x${string}`;
  /** Use real verifier (HonkVerifier) instead of MockVerifier */
  realVerifier?: boolean;
  /** Fund the reward distributor with tokens */
  fundRewardDistributor?: boolean;
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
  options: SetupL1ContractsWithForgeOptions = {},
) => {
  const vkTreeRoot = getVKTreeRoot();

  logger.info('Deploying L1 contracts via forge script', {
    vkTreeRoot: vkTreeRoot.toString(),
    protocolContractsHash: protocolContractsHash.toString(),
    realVerifier: options.realVerifier ?? false,
    fundRewardDistributor: options.fundRewardDistributor ?? true,
    manaTarget: options.manaTarget?.toString(),
    aztecSlotDuration: options.aztecSlotDuration,
    aztecEpochDuration: options.aztecEpochDuration,
    ethereumSlotDuration: options.ethereumSlotDuration,
  });

  const l1Data = await setupL1ContractsViaForge(l1RpcUrl, privateKey, {
    // Runtime options
    logger,
    chain: foundry,
    // Pass initial validators to be added during forge deployment (before governance handover)
    initialValidators: options.initialValidators,
    // Genesis config
    vkTreeRoot: vkTreeRoot.toString(),
    protocolContractsHash: protocolContractsHash.toString(),
    genesisArchiveRoot: options.genesisArchiveRoot,
    // Deployment options
    realVerifier: !(options.realVerifier ?? false),
    fundRewardDistributor: options.fundRewardDistributor,
    // Timing config (ethereumSlotDuration not passed - derived from L1 block time)
    aztecSlotDuration: options.aztecSlotDuration,
    aztecEpochDuration: options.aztecEpochDuration,
    aztecTargetCommitteeSize: options.aztecTargetCommitteeSize,
    // Validator set config
    lagInEpochsForValidatorSet: options.lagInEpochsForValidatorSet,
    lagInEpochsForRandao: options.lagInEpochsForRandao,
    aztecProofSubmissionEpochs: options.aztecProofSubmissionEpochs,
    // GSE config
    activationThreshold: options.activationThreshold?.toString(),
    ejectionThreshold: options.ejectionThreshold?.toString(),
    localEjectionThreshold: options.localEjectionThreshold?.toString(),
    // Slashing config
    slasherFlavor: options.slasherFlavor,
    slashingRoundSizeInEpochs: options.slashingRoundSizeInEpochs,
    slashingLifetimeInRounds: options.slashingLifetimeInRounds,
    slashingExecutionDelayInRounds: options.slashingExecutionDelayInRounds,
    slashingOffsetInRounds: options.slashingOffsetInRounds,
    slashingDisableDuration: options.slashingDisableDuration,
    slashingVetoer: options.slashingVetoer?.toString(),
    slashAmountSmall: options.slashAmountSmall?.toString(),
    slashAmountMedium: options.slashAmountMedium?.toString(),
    slashAmountLarge: options.slashAmountLarge?.toString(),
    // Fee config
    manaTarget: options.manaTarget?.toString(),
    exitDelaySeconds: options.exitDelaySeconds,
    provingCostPerMana: options.provingCostPerMana?.toString(),
    // Governance config
    governanceProposerQuorum: options.governanceProposerQuorum,
    governanceProposerRoundSize: options.governanceProposerRoundSize,
    // ZK Passport config
    zkPassportDomain: options.zkPassportArgs?.zkPassportDomain,
    zkPassportScope: options.zkPassportArgs?.zkPassportScope,
  });

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

  // Note: Initial validators are now added during forge deployment (before governance handover)
  // The initialValidators option is passed to setupL1ContractsViaForge which computes
  // registration tuples and passes them to the Solidity script

  return l1Data;
};
