import { SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, logger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { fileURLToPath } from '@aztec/foundation/url';

import { bn254 } from '@noble/curves/bn254';
import type { Abi, Narrow } from 'abitype';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { Chain, Hex } from 'viem';
import { foundry } from 'viem/chains';

import { isAnvilTestChain } from './chain.js';
import { createExtendedL1Client } from './client.js';
import type { L1ContractsConfig } from './config.js';
import { deployMulticall3 } from './contracts/multicall.js';
import { RollupContract } from './contracts/rollup.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import type { L1TxUtilsConfig } from './l1_tx_utils/config.js';
import type { ExtendedViemWalletClient } from './types.js';

// Validator types for initial validator setup
export interface G2PointJson {
  x0: string;
  x1: string;
  y0: string;
  y1: string;
}

/**
 * Validator data passed to Solidity for registration.
 * Solidity will derive publicKeyG1 and proofOfPossession from the privateKey.
 */
export interface ValidatorJson {
  attester: string;
  withdrawer: string;
  /** BN254 secret key (private key) */
  privateKey: string;
  /** Pre-computed G2 public key (cannot be computed in Solidity) */
  publicKeyInG2: G2PointJson;
}

/**
 * Gets the path to the l1-contracts directory.
 */
export function getL1ContractsPath(): string {
  // Try to find l1-contracts relative to this file
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Go up from yarn-project/ethereum/src to yarn-project, then to repo root, then to l1-contracts
  const l1ContractsPath = resolve(currentDir, '..', '..', '..', 'l1-contracts');
  return l1ContractsPath;
}

/**
 * Return type matching the TypeScript deployAztecL1Contracts function.
 */
export interface ForgeDeployAztecL1ContractsReturnType {
  /** Extended Wallet Client Type. */
  l1Client: ExtendedViemWalletClient;
  /** The currently deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Version of the current rollup contract. */
  rollupVersion: number;
}

/**
 * Computes the validator data for passing to Solidity.
 * Only computes the G2 public key (which requires scalar multiplication on G2, not available in EVM).
 * Solidity will derive G1 public key and proof of possession from the private key.
 */
export function computeValidatorData(operator: Operator): ValidatorJson {
  const privateKey = operator.bn254SecretKey.getValue();

  // Compute G2 public key: pk2 = privateKey * G2
  // This is the only computation we need to do in TypeScript since G2 scalar mul
  // is not available as an EVM precompile
  const publicKeyG2 = bn254.G2.ProjectivePoint.BASE.multiply(privateKey);
  const publicKeyG2Affine = publicKeyG2.toAffine();

  return {
    attester: operator.attester.toString(),
    withdrawer: operator.withdrawer.toString(),
    privateKey: privateKey.toString(),
    publicKeyInG2: {
      x0: publicKeyG2Affine.x.c0.toString(),
      x1: publicKeyG2Affine.x.c1.toString(),
      y0: publicKeyG2Affine.y.c0.toString(),
      y1: publicKeyG2Affine.y.c1.toString(),
    },
  };
}

/**
 * Deployed addresses from the rollup upgrade deployment.
 */
export interface RollupUpgradeAddresses {
  rollupAddress: string;
  verifierAddress: string;
  slashFactoryAddress: string;
  inboxAddress: string;
  outboxAddress: string;
  feeJuicePortalAddress: string;
  rollupVersion: number;
}

/**
 * Return type for rollup upgrade via forge.
 */
export interface ForgeRollupUpgradeResult {
  rollupAddress: Hex;
  verifierAddress: Hex;
  slashFactoryAddress: Hex;
  inboxAddress: Hex;
  outboxAddress: Hex;
  feeJuicePortalAddress: Hex;
  rollupVersion: number;
}

export interface ForgeL1ContractsDeployResult extends ForgeRollupUpgradeResult {
  registryAddress: Hex;
  feeAssetAddress: Hex;
  stakingAssetAddress: Hex;
  gseAddress?: Hex;
  rewardDistributorAddress: Hex;
  coinIssuerAddress: Hex;
  governanceProposerAddress: Hex;
  governanceAddress: Hex;
  dateGatedRelayerAddress?: Hex;
  feeAssetHandlerAddress?: Hex;
  stakingAssetHandlerAddress?: Hex;
  zkPassportVerifierAddress?: Hex;
}

/**
 * Deploys L1 contracts using forge and returns a result compatible with the TypeScript deployAztecL1Contracts function.
 * This queries the Rollup contract to get the inbox, outbox, and feeJuicePortal addresses.
 *
 * All configuration is passed via environment variables to the forge script. The DeploymentConfiguration.sol
 * contract reads these values and applies defaults for any unspecified parameters.
 *
 * @param rpcUrl - The RPC URL to use
 * @param privateKey - The private key for the deployer (with 0x prefix)
 * @param options - Additional deployment options (all optional with sensible defaults)
 * @returns The deployment result with all contract addresses and an l1Client
 */
export async function deployAztecL1Contracts(
  rpcUrl: string,
  privateKey: `0x${string}`,
  chain: Chain,
  logger: Logger,
  args: DeployAztecL1ContractsArgs,
  // TODO CLAUDE Better return type here.
): Promise<ForgeDeployAztecL1ContractsReturnType> {
  logger.info(`Deploying L1 contracts with config: ${jsonStringify(args)}`);
  if (args.initialValidators && args.initialValidators.length > 0 && args.existingTokenAddress) {
    throw new Error(
      'Cannot deploy with both initialValidators and existingTokenAddress. ' +
        'Initial validator funding requires minting tokens, which is not possible with an external token.',
    );
  }
  const currentDir = dirname(fileURLToPath(import.meta.url));

  const l1Client = createExtendedL1Client([rpcUrl], privateKey, chain);
  // Deploy multicall3 if it does not exist in this network
  await deployMulticall3(l1Client, logger);

  const rpcCall = async (method: string, params: any[]) => {
    logger.info(`Calling ${method} with params: ${JSON.stringify(params)}`);
    return (await l1Client.transport.request({
      method,
      params,
    })) as any;
  };

  logger.verbose(`Deploying contracts from ${l1Client.account.address.toString()}`);

  if (isAnvilTestChain(chain.id)) {
    try {
      // We are assuming that you are running this on a local anvil node which have 1s block times
      // To align better with actual deployment, we update the block interval to 12s
      await rpcCall('anvil_setBlockTimestampInterval', [args.ethereumSlotDuration]);
      logger.warn(`Set block interval to ${args.ethereumSlotDuration}`);
    } catch (e) {
      logger.error(`Error setting block interval: ${e}`);
    }
  }

  // Relative location of l1-contracts in monorepo or docker image.
  const l1ContractsPath = resolve(currentDir, '..', '..', '..', 'l1-contracts');

  // From heuristic testing. More caused issues with anvil.
  const MAGIC_ANVIL_BATCH_SIZE = 12;
  const deployWithForge = (outputPath: string): Promise<ForgeL1ContractsDeployResult> => {
    const { promise, resolve, reject } = promiseWithResolvers<ForgeL1ContractsDeployResult>();
    const forgeArgs = [
      'script',
      'script/deploy/DeployAztecL1Contracts.s.sol',
      '--sig',
      'run(string)',
      outputPath,
      '--private-key',
      privateKey,
      '--rpc-url',
      rpcUrl,
      '--broadcast',
      // Anvil seems to stall with unbounded batch size. Otherwise no max batch size is desirable.
      ...(chain.id === foundry.id ? ['--batch-size', MAGIC_ANVIL_BATCH_SIZE.toString()] : []),
    ];
    const proc = spawn('forge', forgeArgs, {
      cwd: l1ContractsPath,
      env: {
        ...process.env,
        // Env vars required by l1-contracts/script/deploy/DeploymentConfiguration.sol.
        NETWORK: getActiveNetworkName(),
        ...getDeployAztecL1ContractsEnvVars(args),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', data => {
      logger.info('[forge] ' + data.toString());
    });

    proc.stderr.on('data', data => {
      logger.error('[forge] ' + data.toString());
    });

    proc.on('error', error => {
      reject(new Error(`Failed to spawn forge: ${error.message}`));
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`DeployRollupForUpgrade.s.sol exited with code ${code}. See logs for details.\n`));
        return;
      }
      (async () => {
        // Try to parse the output file
        // TODO(AD): should this be a zod parse?
        const result: ForgeL1ContractsDeployResult = JSON.parse(await readFile(outputPath, 'utf-8'));
        logger.info(`Deployed L1 contracts with L1 addresses: ${jsonStringify(result)}`);
        resolve(result);
      })().catch(reject);
    });
    return promise;
  };

  const deploymentsDir = join(l1ContractsPath, '.deployments');
  // Use mkdtemp to ensure unique a directory.
  const tmpDir = await mkdtemp(join(deploymentsDir, 'l1-contracts-deploy-'));
  let result: ForgeL1ContractsDeployResult;
  try {
    const outputPath = join(tmpDir, 'rollup-upgrade.json');
    result = await deployWithForge(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  const rollup = new RollupContract(l1Client, result.rollupAddress);

  if (isAnvilTestChain(chain.id)) {
    // @note  We make a time jump PAST the very first slot to not have to deal with the edge case of the first slot.
    //        The edge case being that the genesis block is already occupying slot 0, so we cannot have another block.
    try {
      // Need to get the time
      const currentSlot = await rollup.getSlotNumber();

      if (currentSlot === 0) {
        const ts = Number(await rollup.getTimestampForSlot(SlotNumber(1)));
        await rpcCall('evm_setNextBlockTimestamp', [ts]);
        await rpcCall('hardhat_mine', [1]);
        const currentSlot = await rollup.getSlotNumber();

        if (currentSlot !== 1) {
          throw new Error(`Error jumping time: current slot is ${currentSlot}`);
        }
        logger.info(`Jumped to slot 1`);
      }
    } catch (e) {
      throw new Error(`Error jumping time: ${e}`);
    }
  }

  return {
    l1Client,
    rollupVersion: result.rollupVersion,
    l1ContractAddresses: {
      rollupAddress: EthAddress.fromString(result.rollupAddress),
      registryAddress: EthAddress.fromString(result.registryAddress),
      inboxAddress: EthAddress.fromString(result.inboxAddress),
      outboxAddress: EthAddress.fromString(result.outboxAddress),
      feeJuiceAddress: EthAddress.fromString(result.feeAssetAddress),
      feeJuicePortalAddress: EthAddress.fromString(result.feeJuicePortalAddress),
      coinIssuerAddress: EthAddress.fromString(result.coinIssuerAddress),
      rewardDistributorAddress: EthAddress.fromString(result.rewardDistributorAddress),
      governanceProposerAddress: EthAddress.fromString(result.governanceProposerAddress),
      governanceAddress: EthAddress.fromString(result.governanceAddress),
      stakingAssetAddress: EthAddress.fromString(result.stakingAssetAddress),
      slashFactoryAddress: result.slashFactoryAddress ? EthAddress.fromString(result.slashFactoryAddress) : undefined,
      feeAssetHandlerAddress: result.feeAssetHandlerAddress
        ? EthAddress.fromString(result.feeAssetHandlerAddress)
        : undefined,
      stakingAssetHandlerAddress: result.stakingAssetHandlerAddress
        ? EthAddress.fromString(result.stakingAssetHandlerAddress)
        : undefined,
      zkPassportVerifierAddress: result.zkPassportVerifierAddress
        ? EthAddress.fromString(result.zkPassportVerifierAddress)
        : undefined,
      gseAddress: result.gseAddress ? EthAddress.fromString(result.gseAddress) : undefined,
      dateGatedRelayerAddress: result.dateGatedRelayerAddress
        ? EthAddress.fromString(result.dateGatedRelayerAddress)
        : undefined,
    },
  };
}

export const DEPLOYER_ADDRESS: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

export type Operator = {
  attester: EthAddress;
  withdrawer: EthAddress;
  bn254SecretKey: SecretValue<bigint>;
};

/**
 * Return type of the deployL1Contract function.
 */
export type DeployAztecL1ContractsReturnType = {
  /** Extended Wallet Client Type. */
  l1Client: ExtendedViemWalletClient;
  /** The currently deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Version of the current rollup contract. */
  rollupVersion: number;
};

export interface LinkReferences {
  [fileName: string]: {
    [contractName: string]: ReadonlyArray<{
      start: number;
      length: number;
    }>;
  };
}

export interface Libraries {
  linkReferences: LinkReferences;
  libraryCode: Record<string, ContractArtifacts>;
}

/**
 * Contract artifacts
 */
export interface ContractArtifacts<TAbi extends Abi | readonly unknown[] = Abi> {
  /**
   * The contract name.
   */
  name: string;
  /**
   * The contract abi.
   */
  contractAbi: Narrow<TAbi>;
  /**
   * The contract bytecode
   */
  contractBytecode: Hex;
  /**
   * The contract libraries
   */
  libraries?: Libraries;
}

export type VerificationLibraryEntry = {
  file: string;
  contract: string;
  address: string;
};

export type VerificationRecord = {
  name: string;
  address: string;
  constructorArgsHex: Hex;
  libraries: VerificationLibraryEntry[];
};

export interface DeployAztecL1ContractsArgs extends Omit<L1ContractsConfig, keyof L1TxUtilsConfig> {
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The hash of the protocol contracts. */
  protocolContractsHash: Fr;
  /** The genesis root of the archive tree. */
  genesisArchiveRoot: Fr;
  /** The initial validators for the rollup contract. */
  initialValidators?: Operator[];
  /** The initial balance of the fee juice portal. This is the amount of fee juice that is prefunded to accounts */
  feeJuicePortalInitialBalance?: bigint;
  /** Whether to deploy the real verifier or the mock verifier */
  realVerifier?: boolean;
  /** The zk passport args */
  zkPassportArgs?: ZKPassportArgs;
  /** If provided, use this token for BOTH fee and staking assets (skip deployments) */
  existingTokenAddress?: EthAddress;
}

export interface ZKPassportArgs {
  /** The domain of the zk passport (url) */
  zkPassportDomain?: string;
  /** The scope of the zk passport (personhood, etc) */
  zkPassportScope?: string;
}

// picked up by l1-contracts DeploymentConfiguration.sol
export function getDeployAztecL1ContractsEnvVars(args: DeployAztecL1ContractsArgs) {
  logger.info(`Setting deployment env vars with args: ${jsonStringify(args)}`);
  return {
    ...getDeployRollupForUpgradeEnvVars(args), // parsed by RollupConfiguration.sol
    EXISTING_TOKEN_ADDRESS: args.existingTokenAddress?.toString(),
    AZTEC_ACTIVATION_THRESHOLD: args.activationThreshold?.toString(),
    AZTEC_EJECTION_THRESHOLD: args.ejectionThreshold?.toString(),
    AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE: args.governanceProposerRoundSize?.toString(),
    AZTEC_GOVERNANCE_PROPOSER_QUORUM: args.governanceProposerQuorum?.toString(),
    ZKPASSPORT_DOMAIN: args.zkPassportArgs?.zkPassportDomain,
    ZKPASSPORT_SCOPE: args.zkPassportArgs?.zkPassportScope,
  } as const;
}

// picked up by l1-contracts RollupConfiguration.sol
export function getDeployRollupForUpgradeEnvVars(
  args: Omit<
    DeployAztecL1ContractsArgs,
    | 'governanceProposerQuorum'
    | 'governanceProposerRoundSize'
    | 'ejectionThreshold'
    | 'activationThreshold'
    | 'getZkPassportArgs'
  >,
) {
  return {
    INITIAL_VALIDATORS: JSON.stringify((args.initialValidators ?? []).map(computeValidatorData)),
    REAL_VERIFIER: args.realVerifier ? 'true' : 'false',
    FEE_JUICE_PORTAL_INITIAL_BALANCE: (args.feeJuicePortalInitialBalance ?? 0n).toString(),
    // Genesis state
    VK_TREE_ROOT: args.vkTreeRoot.toString(),
    PROTOCOL_CONTRACTS_HASH: args.protocolContractsHash.toString(),
    GENESIS_ARCHIVE_ROOT: args.genesisArchiveRoot.toString(),
    // Rollup config
    AZTEC_SLOT_DURATION: args.aztecSlotDuration.toString(),
    AZTEC_EPOCH_DURATION: args.aztecEpochDuration.toString(),
    AZTEC_TARGET_COMMITTEE_SIZE: args.aztecTargetCommitteeSize.toString(),
    AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET: args.lagInEpochsForValidatorSet.toString(),
    AZTEC_LAG_IN_EPOCHS_FOR_RANDAO: args.lagInEpochsForRandao.toString(),
    AZTEC_PROOF_SUBMISSION_EPOCHS: args.aztecProofSubmissionEpochs.toString(),
    AZTEC_LOCAL_EJECTION_THRESHOLD: args.localEjectionThreshold.toString(),
    AZTEC_SLASHING_LIFETIME_IN_ROUNDS: args.slashingLifetimeInRounds.toString(),
    AZTEC_SLASHING_VETOER: args.slashingVetoer.toString(),
    AZTEC_SLASHING_DISABLE_DURATION: args.slashingDisableDuration.toString(),
    AZTEC_MANA_TARGET: args.manaTarget.toString(),
    AZTEC_EXIT_DELAY_SECONDS: args.exitDelaySeconds.toString(),
    AZTEC_PROVING_COST_PER_MANA: args.provingCostPerMana.toString(),
    AZTEC_SLASHER_FLAVOR: args.slasherFlavor,
    AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS: args.slashingRoundSizeInEpochs.toString(),
    AZTEC_SLASHING_QUORUM: args.slashingQuorum?.toString(),
    AZTEC_SLASHING_OFFSET_IN_ROUNDS: args.slashingOffsetInRounds.toString(),
    AZTEC_SLASH_AMOUNT_SMALL: args.slashAmountSmall.toString(),
    AZTEC_SLASH_AMOUNT_MEDIUM: args.slashAmountMedium.toString(),
    AZTEC_SLASH_AMOUNT_LARGE: args.slashAmountLarge.toString(),
  } as const;
}

/**
 * Deploys a new rollup, using the existing canonical version to derive certain values (addresses of assets etc).
 */
export const deployRollupForUpgrade = async (
  privateKey: `0x${string}`,
  rpcUrl: string,
  registryAddress: EthAddress,
  logger: Logger,
  args: Omit<
    DeployAztecL1ContractsArgs,
    | 'governanceProposerQuorum'
    | 'governanceProposerRoundSize'
    | 'ejectionThreshold'
    | 'activationThreshold'
    | 'zkPassportArgs'
  >,
) => {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Relative location of l1-contracts in monorepo or docker image.
  const l1ContractsPath = resolve(currentDir, '..', '..', '..', 'l1-contracts');

  const deployWithForge = (outputPath: string): Promise<ForgeRollupUpgradeResult> => {
    const { promise, resolve, reject } = promiseWithResolvers<ForgeRollupUpgradeResult>();
    const proc = spawn(
      'forge',
      [
        'script',
        'script/deploy/DeployRollupForUpgrade.s.sol',
        '--sig',
        'run(string)',
        outputPath,
        '--private-key',
        privateKey,
        '--rpc-url',
        rpcUrl,
        '--broadcast',
      ],
      {
        cwd: l1ContractsPath,
        env: {
          ...process.env,
          // Private key passed via env var (more secure than command line)
          FOUNDRY_PRIVATE_KEY: privateKey,
          // Env vars required by l1-contracts/script/deploy/RollupConfiguration.sol.
          REGISTRY_ADDRESS: registryAddress.toString(),
          NETWORK: getActiveNetworkName(),
          ...getDeployRollupForUpgradeEnvVars(args),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    proc.stdout.on('data', data => {
      logger.info('[forge] ' + data.toString());
    });

    proc.stderr.on('data', data => {
      logger.error('[forge] ' + data.toString());
    });

    proc.on('error', error => {
      reject(new Error(`Failed to spawn forge: ${error.message}`));
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`DeployRollupForUpgrade.s.sol exited with code ${code}. See logs for details.\n`));
      } else {
        (async () => {
          // Try to parse the output file
          const result: ForgeRollupUpgradeResult = JSON.parse(await readFile(outputPath, 'utf-8'));
          if (!result.rollupAddress) {
            throw new Error('Missing rollup address in output!');
          }
          resolve(result);
        })().catch(reject);
      }
    });
    return promise;
  };

  const deploymentsDir = join(l1ContractsPath, '.deployments');
  // Use mkdtemp to ensure unique a directory.
  const tmpDir = await mkdtemp(join(deploymentsDir, 'rollup-upgrade-'));
  let result: ForgeRollupUpgradeResult;
  try {
    const outputPath = join(tmpDir, 'rollup-upgrade.json');
    result = await deployWithForge(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  const extendedClient = createExtendedL1Client([rpcUrl], privateKey);

  // Create RollupContract wrapper for the deployed rollup
  const rollup = new RollupContract(extendedClient, result.rollupAddress);

  return {
    rollup,
    slashFactoryAddress: result.slashFactoryAddress,
  };
};
