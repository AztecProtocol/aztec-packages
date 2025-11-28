import { type Logger, createLogger } from '@aztec/foundation/log';

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

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
      const success = code === 0;
      const result: ForgeScriptResult = {
        success,
        stdout,
        stderr,
        exitCode: code ?? 1,
      };

      if (success) {
        logger.info('Forge script completed successfully');
        // Try to parse addresses from output
        result.deployments = parseDeployedAddresses(stdout);
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

  const result = await runForgeScript({
    scriptPath: 'script/DeployL1Contracts.s.sol:DeployL1Contracts',
    signature: 'run()',
    rpcUrl,
    privateKey,
    broadcast: options.broadcast ?? true,
    env,
    logger,
    additionalArgs: ['-vvv'],
  });

  if (result.success && result.deployments) {
    return {
      ...result,
      addresses: result.deployments as Partial<L1DeploymentAddresses>,
    };
  }

  return result;
}
