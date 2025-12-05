import type { Logger } from '@aztec/aztec.js/log';
import {
  type DeployL1ContractsArgs,
  type ForgeDeploymentOptions,
  type L1ContractsConfig,
  type L1ContractsJsonConfig,
  L1Deployer,
  type Operator,
  RollupContract,
  type ZKPassportArgs,
  addMultipleValidators,
  deployL1Contracts,
  isAnvilTestChain,
  setupL1ContractsViaForge,
} from '@aztec/ethereum';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import type { HDAccount, Hex, PrivateKeyAccount } from 'viem';
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
/**
 * Helper to convert bigint to string for JSON config.
 */
function bigintToStr(value: bigint | undefined): string | undefined {
  return value !== undefined ? value.toString() : undefined;
}

/**
 * Build the L1ContractsJsonConfig from SetupL1ContractsWithForgeOptions.
 * This maps the flat L1ContractsConfig options to the nested JSON format expected by forge.
 *
 * Note: ethereumSlotDuration is NOT passed to forge because:
 * 1. The forge script doesn't read this parameter - it's derived from L1 block time
 * 2. The Rollup contract calculates slotNumber based on L1 timestamps, not ethereumSlotDuration config
 */
function buildL1ContractsJsonConfigFromOptions(
  options: SetupL1ContractsWithForgeOptions,
  vkTreeRoot: string,
): L1ContractsJsonConfig {
  return {
    genesis: {
      vkTreeRoot: BigInt(vkTreeRoot).toString(),
      protocolContractsHash: BigInt(protocolContractsHash.toString()).toString(),
      genesisArchiveRoot: options.genesisArchiveRoot ? BigInt(options.genesisArchiveRoot).toString() : undefined,
    },
    deployment: {
      useMockVerifier: !(options.realVerifier ?? false),
      fundRewardDistributor: options.fundRewardDistributor,
    },
    timing: {
      // Note: ethereumSlotDuration is not passed to forge - L1 block time is inherent to the chain
      aztecSlotDuration: options.aztecSlotDuration,
      aztecEpochDuration: options.aztecEpochDuration,
      targetCommitteeSize: options.aztecTargetCommitteeSize,
    },
    validatorSet: {
      lagInEpochsForValidatorSet: options.lagInEpochsForValidatorSet,
      lagInEpochsForRandao: options.lagInEpochsForRandao,
      aztecProofSubmissionEpochs: options.aztecProofSubmissionEpochs,
    },
    gse: {
      activationThreshold: bigintToStr(options.activationThreshold),
      ejectionThreshold: bigintToStr(options.ejectionThreshold),
    },
    slashing: {
      flavor: options.slasherFlavor,
      roundSizeInEpochs: options.slashingRoundSizeInEpochs,
      lifetimeInRounds: options.slashingLifetimeInRounds,
      executionDelayInRounds: options.slashingExecutionDelayInRounds,
      offsetInRounds: options.slashingOffsetInRounds,
      disableDuration:
        options.slashingDisableDuration !== undefined ? Number(options.slashingDisableDuration) : undefined,
      vetoer: options.slashingVetoer?.toString(),
      amountSmall: bigintToStr(options.slashAmountSmall),
      amountMedium: bigintToStr(options.slashAmountMedium),
      amountLarge: bigintToStr(options.slashAmountLarge),
    },
    fee: {
      manaTarget: bigintToStr(options.manaTarget),
      exitDelaySeconds: options.exitDelaySeconds,
      provingCostPerMana: bigintToStr(options.provingCostPerMana),
      localEjectionThreshold: bigintToStr(options.localEjectionThreshold),
    },
    governance: {
      proposerQuorum: options.governanceProposerQuorum,
      proposerRoundSize: options.governanceProposerRoundSize,
    },
    // stakingQueue is handled by forge_script.ts defaults using LocalEntryQueueConfig
  };
}

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

  // Build stakingAssetHandler config, merging zkPassportArgs with any provided forgeOptions
  // Note: mockZkPassportVerifier is not needed here - the forge script always deploys MockZkPassportVerifier
  const stakingAssetHandler = {
    ...options.forgeOptions?.stakingAssetHandler,
    ...(options.zkPassportArgs?.zkPassportDomain && { zkPassportDomain: options.zkPassportArgs.zkPassportDomain }),
    ...(options.zkPassportArgs?.zkPassportScope && { zkPassportScope: options.zkPassportArgs.zkPassportScope }),
  };

  // Build the config from options, then merge with any explicit forgeOptions.config
  const configFromOptions = buildL1ContractsJsonConfigFromOptions(options, vkTreeRoot.toString());

  // Deep merge: forgeOptions.config overrides configFromOptions
  const mergedConfig: L1ContractsJsonConfig = {
    genesis: { ...configFromOptions.genesis, ...options.forgeOptions?.config?.genesis },
    deployment: { ...configFromOptions.deployment, ...options.forgeOptions?.config?.deployment },
    timing: { ...configFromOptions.timing, ...options.forgeOptions?.config?.timing },
    validatorSet: { ...configFromOptions.validatorSet, ...options.forgeOptions?.config?.validatorSet },
    gse: { ...configFromOptions.gse, ...options.forgeOptions?.config?.gse },
    slashing: { ...configFromOptions.slashing, ...options.forgeOptions?.config?.slashing },
    fee: { ...configFromOptions.fee, ...options.forgeOptions?.config?.fee },
    governance: { ...configFromOptions.governance, ...options.forgeOptions?.config?.governance },
    reward: options.forgeOptions?.config?.reward,
    stakingQueue: options.forgeOptions?.config?.stakingQueue,
  };

  const l1Data = await setupL1ContractsViaForge(l1RpcUrl, privateKey, {
    logger,
    chain: foundry,
    config: mergedConfig,
    stakingAssetHandler: Object.keys(stakingAssetHandler).length > 0 ? stakingAssetHandler : undefined,
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

  // Add initial validators if provided (needed for slashing tests with BLS keys)
  if (options.initialValidators && options.initialValidators.length > 0) {
    const gseAddress = l1Data.l1ContractAddresses.gseAddress;
    const stakingAssetAddress = l1Data.l1ContractAddresses.stakingAssetAddress;

    if (!gseAddress || !stakingAssetAddress) {
      throw new Error('GSE and staking asset addresses are required for adding validators');
    }

    // Log state before adding validators
    const [queueLengthBefore, activeAttestorsBefore, preValidatorBlock] = await Promise.all([
      rollup.getEntryQueueLength(),
      rollup.getActiveAttesterCount(),
      l1Data.l1Client.getBlock(),
    ]);

    logJson(logger, {
      type: 'add_validators_start',
      rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
      validatorCount: options.initialValidators.length,
      queueLengthBefore: queueLengthBefore.toString(),
      activeAttestorsBefore: activeAttestorsBefore.toString(),
      l1BlockNumber: preValidatorBlock.number.toString(),
      l1BlockTimestamp: preValidatorBlock.timestamp.toString(),
    });

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

    // Log state after adding validators
    const [queueLengthAfter, activeAttestorsAfter, postValidatorBlock] = await Promise.all([
      rollup.getEntryQueueLength(),
      rollup.getActiveAttesterCount(),
      l1Data.l1Client.getBlock(),
    ]);

    logJson(logger, {
      type: 'add_validators_complete',
      rollupAddress: l1Data.l1ContractAddresses.rollupAddress.toString(),
      validatorsAdded: options.initialValidators.length,
      queueLengthBefore: queueLengthBefore.toString(),
      queueLengthAfter: queueLengthAfter.toString(),
      activeAttestorsBefore: activeAttestorsBefore.toString(),
      activeAttestorsAfter: activeAttestorsAfter.toString(),
      l1BlockNumber: postValidatorBlock.number.toString(),
      l1BlockTimestamp: postValidatorBlock.timestamp.toString(),
      l1BlocksAdvanced: (postValidatorBlock.number - preValidatorBlock.number).toString(),
      l1TimeAdvanced: (postValidatorBlock.timestamp - preValidatorBlock.timestamp).toString(),
      genesisTime: genesisTime.toString(),
      timeSinceGenesis: (postValidatorBlock.timestamp - genesisTime).toString(),
    });

    logger.info('Initial validators added successfully');
  }

  return l1Data;
};
