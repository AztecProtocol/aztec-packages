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
 * Configuration for running a forge script.
 */
export interface ForgeScriptConfig {
  /** The path to the script file relative to the l1-contracts directory */
  scriptPath: string;
  /** The function signature to call (e.g., "run()") */
  signature?: string;
  /** The RPC URL to use */
  rpcUrl: string;
  /** The private key to use for broadcasting */
  privateKey?: string;
  /** Whether to broadcast transactions */
  broadcast?: boolean;
  /** Whether to verify contracts on Etherscan */
  verify?: boolean;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** The working directory (defaults to l1-contracts) */
  workingDir?: string;
  /** Additional forge arguments */
  additionalArgs?: string[];
  /** Logger instance */
  logger?: Logger;
}

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
function getL1ContractsPath(): string {
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
 * The script emits log_named_address events that we can parse.
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
 * Runs a forge script and returns the result.
 *
 * @param config - The script configuration
 * @returns The script result
 */
// eslint-disable-next-line require-await
export async function runForgeScript(config: ForgeScriptConfig): Promise<ForgeScriptResult> {
  const logger = config.logger ?? createLogger('forge-script');
  const l1ContractsPath = getL1ContractsPath();
  const workingDir = config.workingDir ?? l1ContractsPath;

  if (!existsSync(workingDir)) {
    throw new Error(`Working directory does not exist: ${workingDir}`);
  }

  const args: string[] = ['script', config.scriptPath];

  if (config.signature) {
    args.push('--sig', config.signature);
  }

  args.push('--rpc-url', config.rpcUrl);

  if (config.privateKey) {
    args.push('--private-key', config.privateKey);
  }

  if (config.broadcast) {
    args.push('--broadcast');
  }

  if (config.verify) {
    args.push('--verify');
  }

  if (config.additionalArgs) {
    args.push(...config.additionalArgs);
  }

  // Merge environment variables
  const env = {
    ...process.env,
    ...config.env,
  };

  logger.info(`Running forge script: forge ${args.join(' ')}`);
  logger.verbose(`Working directory: ${workingDir}`);

  return new Promise((resolvePromise, reject) => {
    const proc = spawn('forge', args, {
      cwd: workingDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;
      logger.verbose(text.trim());
    });

    proc.stderr.on('data', data => {
      const text = data.toString();
      stderr += text;
      // Forge outputs progress to stderr, so only log as warning if it looks like an error
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
        logger.warn(text.trim());
      } else {
        logger.verbose(text.trim());
      }
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

      // Always try to parse addresses from output - forge may have deployed contracts
      // successfully but failed on post-deployment verification (e.g., ABI decoding errors)
      result.deployments = parseDeployedAddresses(stdout);

      // Consider deployment successful if we got the key addresses, even if forge
      // returned non-zero exit code due to non-critical errors like ABI decoding
      const hasKeyAddresses = result.deployments?.rollupAddress && result.deployments?.registryAddress;
      if (hasKeyAddresses && !exitSuccess) {
        logger.warn(`Forge exited with code ${code} but deployment appears successful (got contract addresses)`);
        result.success = true;
      } else if (exitSuccess) {
        logger.info('Forge script completed successfully');
      } else {
        logger.error(`Forge script failed with exit code ${code}`);
      }

      resolvePromise(result);
    });
  });
}

/**
 * Options for deploying L1 contracts via forge.
 */
export interface DeployL1ContractsOptions {
  /** Whether to broadcast transactions (default: true) */
  broadcast?: boolean;
  /** The deployer address (defaults to the address derived from privateKey) */
  deployerAddress?: string;
  /** VK tree root (optional) */
  vkTreeRoot?: string;
  /** Protocol contracts hash (optional) */
  protocolContractsHash?: string;
  /** Genesis archive root (optional) */
  genesisArchiveRoot?: string;
  /** Whether to use fake proofs / mock verifier (default: true, reads from FAKE_PROOFS env var) */
  fakeProofs?: boolean;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Deploys L1 contracts using the DeployL1Contracts forge script.
 * This is an alternative to the TypeScript-based deployment in deploy_l1_contracts.ts.
 *
 * @param rpcUrl - The RPC URL to use
 * @param privateKey - The private key for the deployer
 * @param options - Additional deployment options
 * @returns The deployment result with contract addresses
 */
export async function deployL1ContractsViaForge(
  rpcUrl: string,
  privateKey: string,
  options: DeployL1ContractsOptions = {},
): Promise<ForgeScriptResult & { addresses?: Partial<L1DeploymentAddresses> }> {
  const logger = options.logger ?? createLogger('deploy-l1-contracts');

  const env: Record<string, string> = {};

  if (options.deployerAddress) {
    env.DEPLOYER_ADDRESS = options.deployerAddress;
  }

  if (options.vkTreeRoot) {
    env.VK_TREE_ROOT = options.vkTreeRoot;
  }

  if (options.protocolContractsHash) {
    env.PROTOCOL_CONTRACTS_HASH = options.protocolContractsHash;
  }

  if (options.genesisArchiveRoot) {
    env.GENESIS_ARCHIVE_ROOT = options.genesisArchiveRoot;
  }

  // FAKE_PROOFS controls MockVerifier vs HonkVerifier in the forge script
  // Default to true (use mock verifier) if not specified
  const fakeProofs = options.fakeProofs ?? process.env.FAKE_PROOFS !== '0';
  env.FAKE_PROOFS = fakeProofs ? '1' : '0';
  logger.info(`Using ${fakeProofs ? 'MockVerifier' : 'HonkVerifier'} (FAKE_PROOFS=${env.FAKE_PROOFS})`);

  // Use production profile to avoid mock BlobLib with vm.getBlobBaseFee() cheatcode
  // which doesn't work in broadcast mode.
  // Note: When using anvil, it should be started with --hardfork prague (or cancun) for blob base fee support.
  env.FOUNDRY_PROFILE = 'production';

  const result = await runForgeScript({
    scriptPath: 'script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts',
    signature: 'run()',
    rpcUrl,
    privateKey,
    broadcast: options.broadcast ?? true,
    env,
    logger,
    // --force is required to work around a forge bug with ABI decoding of complex nested struct
    // constructor arguments (like RollupConfigInput). The error occurs during transaction logging
    // but doesn't affect the actual deployment. With --force, forge recompiles and proceeds.
    // This adds ~9 seconds to the deployment time due to recompilation.
    additionalArgs: ['-vvv', '--force'],
  });

  if (result.success && result.deployments) {
    return {
      ...result,
      addresses: result.deployments as Partial<L1DeploymentAddresses>,
    };
  }

  return result;
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
 * Options for setupL1ContractsViaForge.
 */
export interface SetupL1ContractsViaForgeOptions extends DeployL1ContractsOptions {
  /** The chain to use (defaults to foundry/anvil) */
  chain?: Chain;
  // fakeProofs is inherited from DeployL1ContractsOptions
}

/**
 * Deploys L1 contracts using forge and returns a result compatible with the TypeScript deployL1Contracts function.
 * This queries the Rollup contract to get the inbox, outbox, and feeJuicePortal addresses.
 *
 * @param rpcUrl - The RPC URL to use
 * @param privateKey - The private key for the deployer (with 0x prefix)
 * @param options - Additional deployment options
 * @returns The deployment result with all contract addresses and an l1Client
 */
export async function setupL1ContractsViaForge(
  rpcUrl: string,
  privateKey: `0x${string}`,
  options: SetupL1ContractsViaForgeOptions = {},
): Promise<ForgeDeployL1ContractsReturnType> {
  const logger = options.logger ?? createLogger('setup-l1-contracts-forge');
  const chain = options.chain ?? foundry;

  // Deploy contracts via forge
  const deployResult = await deployL1ContractsViaForge(rpcUrl, privateKey, options);

  if (!deployResult.success || !deployResult.addresses) {
    throw new Error(`Forge deployment failed: ${deployResult.stderr}`);
  }

  const addresses = deployResult.addresses;

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
