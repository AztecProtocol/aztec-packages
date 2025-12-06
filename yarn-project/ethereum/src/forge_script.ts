import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { bn254 } from '@noble/curves/bn254';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from './client.js';
import type { Operator } from './deploy_l1_contracts.js';
import { type L1ContractsDeployConfig, type ValidatorJson, stringifyConfig } from './forge_deploy_config.js';
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
  // Validator types (Operator is exported from deploy_l1_contracts.js)
  ValidatorJson,
  G2PointJson,
  // Legacy types (deprecated)
} from './forge_deploy_config.js';
export { stringifyConfig } from './forge_deploy_config.js';

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
  /** Parsed deployment addresses if available (from stdout parsing, kept for backwards compatibility) */
  deployments?: ParsedDeploymentAddresses;
  /** The exit code */
  exitCode: number;
}

/**
 * Addresses parsed from forge script stdout logs (fallback parsing).
 * Used by runForgeScript for backwards compatibility.
 */
interface ParsedDeploymentAddresses {
  feeAssetAddress?: string;
  stakingAssetAddress?: string;
  gseAddress?: string;
  registryAddress?: string;
  rewardDistributorAddress?: string;
  governanceProposerAddress?: string;
  governanceAddress?: string;
  coinIssuerAddress?: string;
  verifierAddress?: string;
  rollupAddress?: string;
  feeAssetHandlerAddress?: string;
  stakingAssetHandlerAddress?: string;
  zkPassportVerifierAddress?: string;
}

/**
 * Deployed contract addresses from the L1 deployment.
 * These are written by the Solidity script and read from the JSON output file.
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
  // Addresses queried from Rollup contract by Solidity
  inboxAddress: string;
  outboxAddress: string;
  feeAssetPortalAddress: string;
  rollupVersion: number;
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
 * This is a fallback mechanism - the primary method is reading from the JSON output file.
 *
 * @param stdout - The stdout output from the forge script
 * @returns Parsed addresses
 */
function parseDeployedAddresses(stdout: string): ParsedDeploymentAddresses {
  const addresses: ParsedDeploymentAddresses = {};

  // Match patterns like "FeeAsset: 0x..." from forge console output
  const addressPatterns: { pattern: RegExp; key: keyof ParsedDeploymentAddresses }[] = [
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
export function runForgeScript(
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
 * Computes the validator data for passing to Solidity.
 * Only computes the G2 public key (which requires scalar multiplication on G2, not available in EVM).
 * Solidity will derive G1 public key and proof of possession from the private key.
 */
function computeValidatorData(operator: Operator): ValidatorJson {
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

  // Extract runtime-only options (not passed to Solidity)
  const { logger: _, chain: __, initialValidators, stakingAssetHandler: ___, ...jsonConfig } = options;

  // If initial validators are provided, compute their G2 public keys
  // Solidity will derive G1 and proof of possession from the private key
  let computedValidators: ValidatorJson[] | undefined;
  if (initialValidators && initialValidators.length > 0) {
    logger.info(`Computing validator data for ${initialValidators.length} initial validators`);
    computedValidators = initialValidators.map(operator => {
      const data = computeValidatorData(operator);
      logger.verbose(`Computed validator data for ${data.attester}`);
      return data;
    });
  }

  // Build JSON config string to pass as script parameter
  // DeploymentConfig.sol parses the JSON and applies defaults for missing values
  const jsonConfigStr = stringifyConfig({
    ...jsonConfig,
    ...(computedValidators && { initialValidators: computedValidators }),
  });

  // Create a temp file for the deployment output
  const tempDir = mkdtempSync(join(tmpdir(), 'aztec-deploy-'));
  const outputPath = join(tempDir, 'deployment.json');

  try {
    const result = await runForgeScript(
      [
        'script',
        'script/deploy/rollup/DeployL1Contracts.s.sol',
        '--sig',
        'run(string,string)',
        jsonConfigStr,
        outputPath,
        '--rpc-url',
        rpcUrl,
        '--private-key',
        privateKey,
        '--broadcast',
        '-vvvv',
        // Grant write access to the temp output file
        `--fs-permissions=${outputPath}=read-write`,
      ],
      {
        logger,
      },
    );

    if (!result.success) {
      throw new Error(`Forge deployment failed: ${result.stderr}`);
    }

    // Read addresses from the JSON output file written by Solidity
    if (!existsSync(outputPath)) {
      throw new Error(`Deployment output file not found: ${outputPath}`);
    }

    const addresses: L1DeploymentAddresses = JSON.parse(readFileSync(outputPath, 'utf-8'));
    logger.info('Read deployment addresses from output file', addresses);

    // Verify we got the required addresses from forge output
    if (!addresses.rollupAddress || !addresses.registryAddress) {
      throw new Error(`Forge deployment did not return required addresses. Got: ${JSON.stringify(addresses)}`);
    }

    // Create the extended L1 client
    const l1Client = createExtendedL1Client([rpcUrl], privateKey, chain);

    // Build the full L1ContractAddresses from the JSON file (Solidity queries Rollup for inbox/outbox/portal)
    const l1ContractAddresses: L1ContractAddresses = {
      rollupAddress: EthAddress.fromString(addresses.rollupAddress),
      registryAddress: EthAddress.fromString(addresses.registryAddress),
      inboxAddress: EthAddress.fromString(addresses.inboxAddress),
      outboxAddress: EthAddress.fromString(addresses.outboxAddress),
      feeJuiceAddress: EthAddress.fromString(addresses.feeAssetAddress ?? addresses.stakingAssetAddress!),
      feeJuicePortalAddress: EthAddress.fromString(addresses.feeAssetPortalAddress),
      coinIssuerAddress: EthAddress.fromString(addresses.coinIssuerAddress!),
      rewardDistributorAddress: EthAddress.fromString(addresses.rewardDistributorAddress!),
      governanceProposerAddress: EthAddress.fromString(addresses.governanceProposerAddress!),
      governanceAddress: EthAddress.fromString(addresses.governanceAddress!),
      stakingAssetAddress: EthAddress.fromString(addresses.stakingAssetAddress!),
      gseAddress: addresses.gseAddress ? EthAddress.fromString(addresses.gseAddress) : undefined,
      feeAssetHandlerAddress: addresses.feeAssetHandlerAddress
        ? EthAddress.fromString(addresses.feeAssetHandlerAddress)
        : undefined,
      stakingAssetHandlerAddress: addresses.stakingAssetHandlerAddress
        ? EthAddress.fromString(addresses.stakingAssetHandlerAddress)
        : undefined,
      zkPassportVerifierAddress: addresses.zkPassportVerifierAddress
        ? EthAddress.fromString(addresses.zkPassportVerifierAddress)
        : undefined,
    };

    logger.info('Forge script completed successfully');

    return {
      l1Client,
      l1ContractAddresses,
      rollupVersion: addresses.rollupVersion,
    };
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
