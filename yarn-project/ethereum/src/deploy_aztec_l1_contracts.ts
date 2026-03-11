import { SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { Fr } from '@aztec/foundation/schemas';
import { fileURLToPath } from '@aztec/foundation/url';

import { bn254 } from '@noble/curves/bn254';
import type { Abi, Narrow } from 'abitype';
import { spawn } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import readline from 'readline';
import type { Hex } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

import { createEthereumChain, isAnvilTestChain } from './chain.js';
import { createExtendedL1Client } from './client.js';
import type { L1ContractsConfig } from './config.js';
import { deployMulticall3 } from './contracts/multicall.js';
import { RollupContract } from './contracts/rollup.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import type { ExtendedViemWalletClient } from './types.js';

const logger = createLogger('ethereum:deploy_aztec_l1_contracts');

const JSON_DEPLOY_RESULT_PREFIX = 'JSON DEPLOY RESULT:';

/**
 * Runs a process and parses JSON deploy results from stdout.
 * Lines starting with JSON_DEPLOY_RESULT_PREFIX are parsed and returned.
 * All other stdout goes to logger.info, stderr goes to logger.warn.
 */
function runProcess<T>(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  cwd: string,
): Promise<T | undefined> {
  const { promise, resolve, reject } = promiseWithResolvers<T | undefined>();
  const proc = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let result: T | undefined;
  let parseError: Error | undefined;
  let settled = false;

  readline.createInterface({ input: proc.stdout }).on('line', line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(JSON_DEPLOY_RESULT_PREFIX)) {
      const jsonStr = trimmedLine.slice(JSON_DEPLOY_RESULT_PREFIX.length).trim();
      try {
        result = JSON.parse(jsonStr);
      } catch {
        parseError = new Error(`Failed to parse deploy result JSON: ${jsonStr.slice(0, 200)}`);
      }
    } else {
      logger.info(line);
    }
  });
  readline.createInterface({ input: proc.stderr }).on('line', logger.warn.bind(logger));

  proc.on('error', error => {
    if (settled) {
      return;
    }
    settled = true;
    reject(new Error(`Failed to spawn ${command}: ${error.message}`));
  });

  proc.on('close', code => {
    if (settled) {
      return;
    }
    settled = true;
    if (code !== 0) {
      reject(new Error(`${command} exited with code ${code}`));
    } else if (parseError) {
      reject(parseError);
    } else {
      resolve(result);
    }
  });

  return promise;
}

// Covers an edge where where we may have a cached BlobLib that is not meant for production.
// Despite the profile apparently sometimes cached code remains (so says Lasse after his ignition-monorepo arc).
async function maybeForgeForceProductionBuild(l1ContractsPath: string, script: string, chainId: number) {
  if (chainId === mainnet.id) {
    logger.info(`Recompiling ${script} with production profile for mainnet deployment`);
    logger.info('This may take a minute but ensures production BlobLib is used.');
    await runProcess('forge', ['build', script, '--force'], { FOUNDRY_PROFILE: 'production' }, l1ContractsPath);
  }
}

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
 * Gets the path to the l1-contracts foundry artifacts directory.
 * These are copied from l1-contracts to yarn-project/l1-artifacts/l1-contracts
 * during build to make yarn-project self-contained.
 */
export function getL1ContractsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from yarn-project/ethereum/dest to yarn-project, then to l1-artifacts/l1-contracts
  const l1ContractsPath = resolve(currentDir, '..', '..', 'l1-artifacts', 'l1-contracts');
  return l1ContractsPath;
}

// Cached deployment directory
let preparedDeployDir: string | undefined;

function cleanupDeployDir() {
  if (preparedDeployDir) {
    try {
      rmSync(preparedDeployDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    preparedDeployDir = undefined;
  }
}

/**
 * Prepares a temp directory for forge deployment.
 * Copies all artifacts with preserved timestamps (required for forge cache validity).
 * A fresh broadcast/ directory is created for deployment outputs.
 */
export function prepareL1ContractsForDeployment(): string {
  if (preparedDeployDir && existsSync(preparedDeployDir)) {
    logger.verbose(`Using cached deployment directory: ${preparedDeployDir}`);
    return preparedDeployDir;
  }

  const basePath = getL1ContractsPath();
  logger.verbose(`Preparing L1 contracts from: ${basePath}`);
  const tempDir = mkdtempSync(join(tmpdir(), '.foundry-deploy-'));
  logger.verbose(`Created temp directory for deployment: ${tempDir}`);
  preparedDeployDir = tempDir;
  process.on('exit', cleanupDeployDir);

  // Copy all dirs with preserved timestamps (required for forge cache validity)
  const copyOpts = { recursive: true, preserveTimestamps: true };
  cpSync(join(basePath, 'out'), join(tempDir, 'out'), copyOpts);
  cpSync(join(basePath, 'lib'), join(tempDir, 'lib'), copyOpts);
  cpSync(join(basePath, 'cache'), join(tempDir, 'cache'), copyOpts);
  cpSync(join(basePath, 'src'), join(tempDir, 'src'), copyOpts);
  cpSync(join(basePath, 'script'), join(tempDir, 'script'), copyOpts);
  cpSync(join(basePath, 'generated'), join(tempDir, 'generated'), copyOpts);
  // Kludge: copy test/ to appease forge cache which references test/shouting.t.sol
  cpSync(join(basePath, 'test'), join(tempDir, 'test'), copyOpts);
  cpSync(join(basePath, 'foundry.lock'), join(tempDir, 'foundry.lock'));

  // Update foundry.toml to use absolute path to solc binary (avoids copying to noexec tmpfs)
  const foundryTomlPath = join(basePath, 'foundry.toml');
  let foundryToml = readFileSync(foundryTomlPath, 'utf-8');
  const solcPathMatch = foundryToml.match(/solc\s*=\s*"\.\/solc-([^"]+)"/);
  // Did we find a hardcoded solc path that we need to make absolute?
  // This code path happens in CI currently as we bundle solc there to avoid race conditions when
  // downloading solc.
  if (solcPathMatch) {
    const solcVersion = solcPathMatch[1];
    const absoluteSolcPath = join(basePath, `solc-${solcVersion}`);
    foundryToml = foundryToml.replace(/solc\s*=\s*"\.\/solc-[^"]+"/, `solc = "${absoluteSolcPath}"`);
    logger.verbose(`Updated solc path in foundry.toml to: ${absoluteSolcPath}`);
  }
  writeFileSync(join(tempDir, 'foundry.toml'), foundryToml);

  mkdirSync(join(tempDir, 'broadcast'));
  return tempDir;
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
  chainId: number,
  args: DeployAztecL1ContractsArgs,
): Promise<DeployAztecL1ContractsReturnType> {
  logger.info(`Deploying L1 contracts with config: ${jsonStringify(args)}`);
  if (args.initialValidators && args.initialValidators.length > 0 && args.existingTokenAddress) {
    throw new Error(
      'Cannot deploy with both initialValidators and existingTokenAddress. ' +
        'Initial validator funding requires minting tokens, which is not possible with an external token.',
    );
  }
  const chain = createEthereumChain([rpcUrl], chainId);

  const l1Client = createExtendedL1Client([rpcUrl], privateKey, chain.chainInfo);
  const rpcCall = async (method: string, params: any[]) => {
    logger.info(`Calling ${method} with params: ${JSON.stringify(params)}`);
    return (await l1Client.transport.request({
      method,
      params,
    })) as any;
  };

  logger.verbose(`Deploying contracts from ${l1Client.account.address.toString()}`);

  // Deploy multicall3 if it does not exist in this network
  // Sepolia and mainnet will have this.
  await deployMulticall3(l1Client, logger);

  if (isAnvilTestChain(chainId)) {
    try {
      // We are assuming that you are running this on a local anvil node which have 1s block times
      // To align better with actual deployment, we update the block interval to 12s
      await rpcCall('anvil_setBlockTimestampInterval', [args.ethereumSlotDuration]);
      logger.warn(`Set block interval to ${args.ethereumSlotDuration}`);
    } catch (e) {
      logger.error(`Error setting block interval: ${e}`);
    }
  }

  // Use foundry-artifacts from l1-artifacts package
  const l1ContractsPath = prepareL1ContractsForDeployment();

  const FORGE_SCRIPT = 'script/deploy/DeployAztecL1Contracts.s.sol';
  await maybeForgeForceProductionBuild(l1ContractsPath, FORGE_SCRIPT, chainId);

  // Verify contracts on Etherscan when on mainnet/sepolia and ETHERSCAN_API_KEY is available.
  const isVerifiableChain = chainId === mainnet.id || chainId === sepolia.id;
  const shouldVerify = isVerifiableChain && !!process.env.ETHERSCAN_API_KEY;

  if (isVerifiableChain && !process.env.ETHERSCAN_API_KEY) {
    logger.warn(
      `Deploying to chain ${chainId} (${chainId === mainnet.id ? 'mainnet' : 'sepolia'}) without ETHERSCAN_API_KEY. ` +
        `Contracts will NOT be verified on Etherscan. Set ETHERSCAN_API_KEY environment variable to enable verification.`,
    );
  }

  const scriptPath = join(getL1ContractsPath(), 'scripts', 'forge_broadcast.js');
  const forgeArgs = [
    FORGE_SCRIPT,
    '--sig',
    'run()',
    '--private-key',
    privateKey,
    '--rpc-url',
    rpcUrl,
    ...(shouldVerify ? ['--verify'] : []),
  ];
  const forgeEnv = {
    // Env vars required by l1-contracts/script/deploy/DeploymentConfiguration.sol.
    NETWORK: getActiveNetworkName(),
    FOUNDRY_PROFILE: chainId === mainnet.id ? 'production' : undefined,
    ...getDeployAztecL1ContractsEnvVars(args),
  };
  const result = await runProcess<ForgeL1ContractsDeployResult>(
    process.execPath,
    [scriptPath, ...forgeArgs],
    forgeEnv,
    l1ContractsPath,
  );
  if (!result) {
    throw new Error('Forge script did not output deployment result');
  }
  logger.info(`Deployed L1 contracts with L1 addresses: ${jsonStringify(result)}`);

  const rollup = new RollupContract(l1Client, result.rollupAddress);

  if (isAnvilTestChain(chainId)) {
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
 * Return type of the deployAztecL1Contracts function.
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

export interface DeployAztecL1ContractsArgs
  extends Omit<
    L1ContractsConfig,
    | 'gasLimitBufferPercentage'
    | 'maxGwei'
    | 'maxBlobGwei'
    | 'priorityFeeBumpPercentage'
    | 'priorityFeeRetryBumpPercentage'
    | 'minimumPriorityFeePerGas'
    | 'maxSpeedUpAttempts'
    | 'checkIntervalMs'
    | 'stallTimeMs'
    | 'txTimeoutMs'
    | 'cancelTxOnTimeout'
    | 'txCancellationFinalTimeoutMs'
    | 'txUnseenConsideredDroppedMs'
    | 'enableDelayer'
    | 'txDelayerMaxInclusionTimeIntoSlot'
  > {
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
  return {
    ...getDeployRollupForUpgradeEnvVars(args), // parsed by RollupConfiguration.sol
    EXISTING_TOKEN_ADDRESS: args.existingTokenAddress?.toString(),
    AZTEC_ACTIVATION_THRESHOLD: args.activationThreshold?.toString(),
    AZTEC_EJECTION_THRESHOLD: args.ejectionThreshold?.toString(),
    AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE: args.governanceProposerRoundSize?.toString(),
    AZTEC_GOVERNANCE_PROPOSER_QUORUM: args.governanceProposerQuorum?.toString(),
    AZTEC_GOVERNANCE_VOTING_DURATION: args.governanceVotingDuration?.toString(),
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
    AZTEC_INBOX_LAG: args.inboxLag?.toString(),
    AZTEC_PROOF_SUBMISSION_EPOCHS: args.aztecProofSubmissionEpochs.toString(),
    AZTEC_LOCAL_EJECTION_THRESHOLD: args.localEjectionThreshold.toString(),
    AZTEC_SLASHING_LIFETIME_IN_ROUNDS: args.slashingLifetimeInRounds.toString(),
    AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS: args.slashingExecutionDelayInRounds.toString(),
    AZTEC_SLASHING_VETOER: args.slashingVetoer.toString(),
    AZTEC_SLASHING_DISABLE_DURATION: args.slashingDisableDuration.toString(),
    AZTEC_MANA_TARGET: args.manaTarget.toString(),
    AZTEC_EXIT_DELAY_SECONDS: args.exitDelaySeconds.toString(),
    AZTEC_PROVING_COST_PER_MANA: args.provingCostPerMana.toString(),
    AZTEC_INITIAL_ETH_PER_FEE_ASSET: args.initialEthPerFeeAsset.toString(),
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
  chainId: number,
  registryAddress: EthAddress,
  args: Omit<
    DeployAztecL1ContractsArgs,
    | 'governanceProposerQuorum'
    | 'governanceProposerRoundSize'
    | 'ejectionThreshold'
    | 'activationThreshold'
    | 'zkPassportArgs'
  >,
) => {
  // Use foundry-artifacts from l1-artifacts package
  const l1ContractsPath = prepareL1ContractsForDeployment();

  const FORGE_SCRIPT = 'script/deploy/DeployRollupForUpgrade.s.sol';
  await maybeForgeForceProductionBuild(l1ContractsPath, FORGE_SCRIPT, chainId);

  const scriptPath = join(getL1ContractsPath(), 'scripts', 'forge_broadcast.js');
  const forgeArgs = [FORGE_SCRIPT, '--sig', 'run()', '--private-key', privateKey, '--rpc-url', rpcUrl];
  const forgeEnv = {
    FOUNDRY_PROFILE: chainId === mainnet.id ? 'production' : undefined,
    // Env vars required by l1-contracts/script/deploy/RollupConfiguration.sol.
    REGISTRY_ADDRESS: registryAddress.toString(),
    NETWORK: getActiveNetworkName(),
    ...getDeployRollupForUpgradeEnvVars(args),
  };

  const result = await runProcess<ForgeRollupUpgradeResult>(
    process.execPath,
    [scriptPath, ...forgeArgs],
    forgeEnv,
    l1ContractsPath,
  );
  if (!result) {
    throw new Error('Forge script did not output deployment result');
  }

  const extendedClient = createExtendedL1Client([rpcUrl], privateKey);

  // Create RollupContract wrapper for the deployed rollup
  const rollup = new RollupContract(extendedClient, result.rollupAddress);

  return {
    rollup,
    slashFactoryAddress: result.slashFactoryAddress,
  };
};
