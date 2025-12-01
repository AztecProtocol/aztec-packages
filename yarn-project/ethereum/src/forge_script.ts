import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { type Chain, createPublicClient, getContract, http } from 'viem';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from './client.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import type { ExtendedViemWalletClient } from './types.js';

// Minimal ABI for Rollup contract to get addresses
const RollupAddressesAbi = [
  {
    inputs: [],
    name: 'getInbox',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getOutbox',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getFeeAssetPortal',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getVersion',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Result of running a forge script.
 */
export interface ForgeScriptResult {
  /** Whether the script succeeded */
  success: boolean;
  /** The stdout output */
  stdout: string;
  /** The stderr output */
  stderr: string;
  /** Parsed deployment addresses if available */
  deployments?: Record<string, string>;
  /** The exit code */
  exitCode: number;
}

/**
 * Deployed contract addresses from the L1 deployment.
 */
export interface L1DeploymentAddresses {
  feeAssetAddress: string;
  stakingAssetAddress: string;
  gseAddress: string;
  registryAddress: string;
  rewardDistributorAddress: string;
  governanceProposerAddress: string;
  governanceAddress: string;
  coinIssuerAddress: string;
  verifierAddress: string;
  rollupAddress: string;
  feeAssetHandlerAddress: string;
}

/**
 * Gets the path to the l1-contracts directory.
 */
export function getL1ContractsPath(): string {
  // Try to find l1-contracts relative to this file
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Go up from yarn-project/ethereum/src to yarn-project, then to repo root, then to l1-contracts
  const l1ContractsPath = resolve(currentDir, '..', '..', '..', 'l1-contracts');

  if (existsSync(l1ContractsPath)) {
    return l1ContractsPath;
  }

  // Fallback to environment variable
  const envPath = process.env.L1_CONTRACTS_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  throw new Error(
    `Could not find l1-contracts directory. Checked ${l1ContractsPath}. ` +
      `Set L1_CONTRACTS_PATH environment variable to the correct path.`,
  );
}

/**
 * Parses deployed addresses from forge script output.
 *
 * @param stdout - The stdout output from the forge script
 * @returns Parsed addresses
 */
function parseDeployedAddresses(stdout: string): Partial<L1DeploymentAddresses> {
  const addresses: Partial<L1DeploymentAddresses> = {};

  // Match patterns like "FeeAsset: 0x..." from forge console output
  const addressPatterns: { pattern: RegExp; key: keyof L1DeploymentAddresses }[] = [
    { pattern: /FeeAsset:\s*(0x[a-fA-F0-9]{40})/i, key: 'feeAssetAddress' },
    { pattern: /StakingAsset:\s*(0x[a-fA-F0-9]{40})/i, key: 'stakingAssetAddress' },
    { pattern: /GSE:\s*(0x[a-fA-F0-9]{40})/i, key: 'gseAddress' },
    { pattern: /Registry:\s*(0x[a-fA-F0-9]{40})/i, key: 'registryAddress' },
    { pattern: /RewardDistributor:\s*(0x[a-fA-F0-9]{40})/i, key: 'rewardDistributorAddress' },
    { pattern: /GovernanceProposer:\s*(0x[a-fA-F0-9]{40})/i, key: 'governanceProposerAddress' },
    { pattern: /Governance:\s*(0x[a-fA-F0-9]{40})/i, key: 'governanceAddress' },
    { pattern: /CoinIssuer:\s*(0x[a-fA-F0-9]{40})/i, key: 'coinIssuerAddress' },
    { pattern: /Verifier:\s*(0x[a-fA-F0-9]{40})/i, key: 'verifierAddress' },
    { pattern: /Rollup:\s*(0x[a-fA-F0-9]{40})/i, key: 'rollupAddress' },
    { pattern: /FeeAssetHandler:\s*(0x[a-fA-F0-9]{40})/i, key: 'feeAssetHandlerAddress' },
  ];

  for (const { pattern, key } of addressPatterns) {
    const match = stdout.match(pattern);
    if (match) {
      addresses[key] = match[1];
    }
  }

  return addresses;
}

/**
 * Runs a forge command and returns the result.
 *
 * @param args - The arguments to pass to forge
 * @param options - Optional configuration
 * @returns The script result
 */
export async function runForgeScript(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    logger?: Logger;
  } = {},
): Promise<ForgeScriptResult> {
  const logger = options.logger ?? createLogger('forge-script');
  const cwd = options.cwd ?? getL1ContractsPath();

  if (!existsSync(cwd)) {
    throw new Error(`Working directory does not exist: ${cwd}`);
  }

  const env = {
    ...process.env,
    ...options.env,
  };

  logger.info(`Running: forge ${args.join(' ')}`);
  logger.verbose(`Working directory: ${cwd}`);

  return new Promise((resolvePromise, reject) => {
    const proc = spawn('forge', args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;
      logger.info(`[forge] ${text.trim()}`);
    });

    proc.stderr.on('data', data => {
      const text = data.toString();
      stderr += text;
      logger.info(`[forge] ${text.trim()}`);
    });

    proc.on('error', error => {
      reject(new Error(`Failed to spawn forge: ${error.message}`));
    });

    proc.on('close', code => {
      const exitSuccess = code === 0;
      const result: ForgeScriptResult = {
        success: exitSuccess,
        stdout,
        stderr,
        exitCode: code ?? 1,
      };

      // Try to parse addresses from output
      result.deployments = parseDeployedAddresses(stdout);

      logger.info('Parsed deployment addresses:', result.deployments);

      // Consider deployment successful if we got the key addresses
      const hasKeyAddresses = result.deployments?.rollupAddress && result.deployments?.registryAddress;
      if (hasKeyAddresses && !exitSuccess) {
        logger.warn(`Forge exited with code ${code} but deployment appears successful (got contract addresses)`);
        result.success = true;
      } else if (exitSuccess) {
        logger.info('Forge script completed successfully');
      } else {
        logger.error(`Forge script failed with exit code ${code}`);
        logger.error(`stdout: ${stdout}`);
        logger.error(`stderr: ${stderr}`);
      }

      resolvePromise(result);
    });
  });
}

/**
 * Return type matching the TypeScript deployL1Contracts function.
 */
export interface ForgeDeployL1ContractsReturnType {
  /** Extended Wallet Client Type. */
  l1Client: ExtendedViemWalletClient;
  /** The currently deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Version of the current rollup contract. */
  rollupVersion: number;
}

/**
 * Configuration options for forge-based L1 contract deployment.
 * All parameters map to environment variables in the Solidity E2EConfiguration contract.
 */
export interface ForgeDeploymentOptions {
  /** Chain to deploy to (defaults to foundry/anvil) */
  chain?: Chain;
  /** Logger instance */
  logger?: Logger;
  /** VK tree root (hex string) */
  vkTreeRoot?: string;
  /** Protocol contracts hash (hex string) */
  protocolContractsHash?: string;
  /** Genesis archive root (hex string) */
  genesisArchiveRoot?: string;
  /** Use real verifier (HonkVerifier) instead of MockVerifier */
  realVerifier?: boolean;
  /** Fund the reward distributor with tokens (default: true) */
  fundRewardDistributor?: boolean;
  /** L2 slot duration in seconds (default: 36) */
  aztecSlotDuration?: number;
  /** L2 epoch duration in slots (default: 32) */
  aztecEpochDuration?: number;
  /** Target committee size (default: 0 for e2e tests) */
  targetCommitteeSize?: number;
  /** Slasher flavor: 'none' | 'empire' | 'tally' (default: 'none') */
  slasherFlavor?: 'none' | 'empire' | 'tally';
  /** GSE activation threshold in wei */
  activationThreshold?: bigint;
  /** GSE ejection threshold in wei */
  ejectionThreshold?: bigint;
  /** Amount to fund the reward distributor */
  rewardDistributorFunding?: bigint;
}

/**
 * Converts slasher flavor string to numeric value for forge env.
 */
function slasherFlavorToEnvValue(flavor?: 'none' | 'empire' | 'tally'): string {
  switch (flavor) {
    case 'empire':
      return '1';
    case 'tally':
      return '2';
    case 'none':
    default:
      return '0';
  }
}

/**
 * Deploys L1 contracts using forge and returns a result compatible with the TypeScript deployL1Contracts function.
 * This queries the Rollup contract to get the inbox, outbox, and feeJuicePortal addresses.
 *
 * All configuration is passed via environment variables to the forge script. The E2EConfiguration.sol
 * contract reads these values and applies defaults for any unspecified parameters.
 *
 * @param rpcUrl - The RPC URL to use
 * @param privateKey - The private key for the deployer (with 0x prefix)
 * @param options - Additional deployment options (all optional with sensible defaults)
 * @returns The deployment result with all contract addresses and an l1Client
 */
export async function setupL1ContractsViaForge(
  rpcUrl: string,
  privateKey: `0x${string}`,
  options: ForgeDeploymentOptions = {},
): Promise<ForgeDeployL1ContractsReturnType> {
  const logger = options.logger ?? createLogger('setup-l1-contracts-forge');
  const chain = options.chain ?? foundry;

  // Build environment variables for forge script
  // FAKE_PROOFS controls MockVerifier vs HonkVerifier
  const fakeProofs = options.realVerifier === true ? '0' : '1';
  logger.info(`Using ${fakeProofs === '1' ? 'MockVerifier' : 'HonkVerifier'} (FAKE_PROOFS=${fakeProofs})`);

  // Build env object with all configuration
  const env: Record<string, string> = {
    FAKE_PROOFS: fakeProofs,
  };

  // Genesis state
  if (options.vkTreeRoot) {
    env.VK_TREE_ROOT = options.vkTreeRoot;
  }
  if (options.protocolContractsHash) {
    env.PROTOCOL_CONTRACTS_HASH = options.protocolContractsHash;
  }
  if (options.genesisArchiveRoot) {
    env.GENESIS_ARCHIVE_ROOT = options.genesisArchiveRoot;
  }

  // Deployment options
  if (options.fundRewardDistributor !== undefined) {
    env.FUND_REWARD_DISTRIBUTOR = options.fundRewardDistributor ? '1' : '0';
  }

  // Rollup configuration
  if (options.aztecSlotDuration !== undefined) {
    env.AZTEC_SLOT_DURATION = options.aztecSlotDuration.toString();
  }
  if (options.aztecEpochDuration !== undefined) {
    env.AZTEC_EPOCH_DURATION = options.aztecEpochDuration.toString();
  }
  if (options.targetCommitteeSize !== undefined) {
    env.TARGET_COMMITTEE_SIZE = options.targetCommitteeSize.toString();
  }
  if (options.slasherFlavor !== undefined) {
    env.SLASHER_FLAVOR = slasherFlavorToEnvValue(options.slasherFlavor);
  }

  // GSE configuration
  if (options.activationThreshold !== undefined) {
    env.ACTIVATION_THRESHOLD = options.activationThreshold.toString();
  }
  if (options.ejectionThreshold !== undefined) {
    env.EJECTION_THRESHOLD = options.ejectionThreshold.toString();
  }

  // Reward distributor
  if (options.rewardDistributorFunding !== undefined) {
    env.REWARD_DISTRIBUTOR_FUNDING = options.rewardDistributorFunding.toString();
  }

  logger.verbose('Forge deployment environment', env);

  const result = await runForgeScript(
    [
      'script',
      'script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts',
      '--sig',
      'run()',
      '--rpc-url',
      rpcUrl,
      '--private-key',
      privateKey,
      '--broadcast',
      '-vvv',
    ],
    {
      env,
      logger,
    },
  );

  if (!result.success || !result.deployments) {
    throw new Error(`Forge deployment failed: ${result.stderr}`);
  }

  const addresses = result.deployments;

  // Verify we got the required addresses from forge output
  if (!addresses.rollupAddress || !addresses.registryAddress) {
    throw new Error(`Forge deployment did not return required addresses. Got: ${JSON.stringify(addresses)}`);
  }

  // Create a public client to query the Rollup contract for additional addresses
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Query Rollup contract for inbox, outbox, feeJuicePortal addresses
  const rollupContract = getContract({
    address: addresses.rollupAddress as `0x${string}`,
    abi: RollupAddressesAbi,
    client: publicClient,
  });

  const [inboxAddress, outboxAddress, feeAssetPortalAddress, rollupVersion] = await Promise.all([
    rollupContract.read.getInbox(),
    rollupContract.read.getOutbox(),
    rollupContract.read.getFeeAssetPortal(),
    rollupContract.read.getVersion(),
  ]);

  logger.info('Retrieved addresses from Rollup contract', {
    inboxAddress,
    outboxAddress,
    feeAssetPortalAddress,
    rollupVersion: Number(rollupVersion),
  });

  // Create the extended L1 client
  const l1Client = createExtendedL1Client([rpcUrl], privateKey, chain);

  // Build the full L1ContractAddresses
  const l1ContractAddresses: L1ContractAddresses = {
    rollupAddress: EthAddress.fromString(addresses.rollupAddress),
    registryAddress: EthAddress.fromString(addresses.registryAddress),
    inboxAddress: EthAddress.fromString(inboxAddress),
    outboxAddress: EthAddress.fromString(outboxAddress),
    feeJuiceAddress: EthAddress.fromString(addresses.feeAssetAddress ?? addresses.stakingAssetAddress!),
    feeJuicePortalAddress: EthAddress.fromString(feeAssetPortalAddress),
    coinIssuerAddress: EthAddress.fromString(addresses.coinIssuerAddress!),
    rewardDistributorAddress: EthAddress.fromString(addresses.rewardDistributorAddress!),
    governanceProposerAddress: EthAddress.fromString(addresses.governanceProposerAddress!),
    governanceAddress: EthAddress.fromString(addresses.governanceAddress!),
    stakingAssetAddress: EthAddress.fromString(addresses.stakingAssetAddress!),
    gseAddress: addresses.gseAddress ? EthAddress.fromString(addresses.gseAddress) : undefined,
    feeAssetHandlerAddress: addresses.feeAssetHandlerAddress
      ? EthAddress.fromString(addresses.feeAssetHandlerAddress)
      : undefined,
  };

  return {
    l1Client,
    l1ContractAddresses,
    rollupVersion: Number(rollupVersion),
  };
}
