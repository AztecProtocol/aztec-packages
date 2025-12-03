import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { type Chain, createPublicClient, getContract, http } from 'viem';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from './client.js';
import { type L1ContractsDeployConfig, stringifyConfig } from './forge_deploy_config.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import type { ExtendedViemWalletClient } from './types.js';

// Re-export config types for convenience
export type {
  // New nested types
  ForgeRuntimeOptions,
  L1ContractsJsonConfig,
  L1ContractsDeployConfig,
  StakingAssetHandlerJsonConfig,
  StakingAssetHandlerDeployConfig,
  // Section types
  DeploymentSection,
  GenesisSection,
  TimingSection,
  ValidatorSetSection,
  GseSection,
  SlashingSection,
  FeeSection,
  GovernanceSection,
  RewardSection,
  StakingQueueSection,
  // Legacy types (deprecated)
  ForgeDeploymentConfig,
  ForgeDeploymentJsonConfig,
} from './forge_deploy_config.js';
export { stringifyConfig } from './forge_deploy_config.js';

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
  stakingAssetHandlerAddress: string;
  zkPassportVerifierAddress: string;
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
    { pattern: /StakingAssetHandler:\s*(0x[a-fA-F0-9]{40})/i, key: 'stakingAssetHandlerAddress' },
    { pattern: /MockZKPassportVerifier:\s*(0x[a-fA-F0-9]{40})/i, key: 'zkPassportVerifierAddress' },
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

// ForgeDeploymentOptions is now an alias for the new L1ContractsDeployConfig
export type ForgeDeploymentOptions = L1ContractsDeployConfig;

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

  // Build JSON config string to pass as script parameter
  // DeploymentConfig.sol parses the JSON and applies defaults for missing values
  const jsonConfigStr = stringifyConfig(options.config ?? {});

  const useMockVerifier = options.config?.deployment?.useMockVerifier !== false;
  logger.info(`Using ${useMockVerifier ? 'MockVerifier' : 'HonkVerifier'}`);
  logger.verbose('Forge deployment config', jsonConfigStr);

  const result = await runForgeScript(
    [
      'script',
      'script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts',
      '--sig',
      'run(string)',
      jsonConfigStr,
      '--rpc-url',
      rpcUrl,
      '--private-key',
      privateKey,
      '--broadcast',
      '-vvv',
    ],
    {
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

  // Deploy StakingAssetHandler (for testing validator staking infrastructure)
  // This is a separate script because it's only needed for local testing
  let stakingAssetHandlerAddress: string | undefined = addresses.stakingAssetHandlerAddress;
  let zkPassportVerifierAddress: string | undefined = addresses.zkPassportVerifierAddress;
  if (!stakingAssetHandlerAddress && addresses.stakingAssetAddress && addresses.registryAddress) {
    logger.info('Deploying StakingAssetHandler...');

    // Build minimal JSON config with only what StakingAssetHandler needs
    const stakingHandlerConfigStr = stringifyConfig({
      stakingAsset: addresses.stakingAssetAddress,
      registry: addresses.registryAddress,
      zkPassportDomain: options.stakingAssetHandler?.zkPassportDomain,
      zkPassportScope: options.stakingAssetHandler?.zkPassportScope,
    });

    const stakingHandlerResult = await runForgeScript(
      [
        'script',
        'script/deploy/rollup/DeployStakingAssetHandler.s.sol:DeployStakingAssetHandler',
        '--sig',
        'run(string)',
        stakingHandlerConfigStr,
        '--rpc-url',
        rpcUrl,
        '--private-key',
        privateKey,
        '--broadcast',
        '-vvv',
      ],
      {
        logger,
      },
    );

    if (stakingHandlerResult.success) {
      // Parse StakingAssetHandler and MockZKPassportVerifier addresses from output
      const stakingHandlerAddresses = parseDeployedAddresses(stakingHandlerResult.stdout);
      stakingAssetHandlerAddress = stakingHandlerAddresses.stakingAssetHandlerAddress;
      zkPassportVerifierAddress = stakingHandlerAddresses.zkPassportVerifierAddress;
      if (stakingAssetHandlerAddress) {
        logger.info(`Deployed StakingAssetHandler at ${stakingAssetHandlerAddress}`);
      }
      if (zkPassportVerifierAddress) {
        logger.info(`Deployed MockZKPassportVerifier at ${zkPassportVerifierAddress}`);
      }
    } else {
      logger.warn('Failed to deploy StakingAssetHandler (non-critical for most tests)');
    }
  }

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
    stakingAssetHandlerAddress: stakingAssetHandlerAddress
      ? EthAddress.fromString(stakingAssetHandlerAddress)
      : undefined,
    zkPassportVerifierAddress: zkPassportVerifierAddress ? EthAddress.fromString(zkPassportVerifierAddress) : undefined,
  };

  return {
    l1Client,
    l1ContractAddresses,
    rollupVersion: Number(rollupVersion),
  };
}
