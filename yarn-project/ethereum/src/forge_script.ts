import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { bn254 } from '@noble/curves/bn254';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, getContract, http, keccak256 as viemKeccak256 } from 'viem';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from './client.js';
import type { Operator } from './deploy_l1_contracts.js';
import {
  type L1ContractsDeployConfig,
  type L1ContractsJsonConfig,
  type ValidatorJson,
  stringifyConfig,
} from './forge_deploy_config.js';
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
  // Validator types (Operator is exported from deploy_l1_contracts.js)
  ValidatorJson,
  G1PointJson,
  G2PointJson,
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

// Domain separator for BN254 proof of possession (must match BN254Lib.sol)
const STAKING_DOMAIN_SEPARATOR = 'AZTEC_BLS_POP_BN254_V1';

/**
 * Computes the registration tuple for a validator from their BN254 secret key.
 * This mirrors the logic in GSEContract.makeRegistrationTuple but without needing the GSE contract.
 *
 * The proof of possession proves:
 * 1. Knowledge of the secret key for publicKeyInG2 (prevents rogue-key attacks)
 * 2. That publicKeyInG1 and publicKeyInG2 share the same secret key
 */
function computeRegistrationTuple(operator: Operator): ValidatorJson {
  const privateKey = operator.bn254SecretKey.getValue();

  // Compute G1 public key: pk1 = privateKey * G1
  const publicKeyG1 = bn254.G1.ProjectivePoint.BASE.multiply(privateKey);
  const publicKeyG1Affine = publicKeyG1.toAffine();

  // Compute G2 public key: pk2 = privateKey * G2
  const publicKeyG2 = bn254.G2.ProjectivePoint.BASE.multiply(privateKey);
  const publicKeyG2Affine = publicKeyG2.toAffine();

  // Compute the digest point (hash of pk1 to a curve point)
  // This matches BN254Lib.g1ToDigestPoint which calls hashToPoint(STAKING_DOMAIN_SEPARATOR, pk1)
  const pk1Bytes = Buffer.concat([
    Buffer.from(publicKeyG1Affine.x.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(publicKeyG1Affine.y.toString(16).padStart(64, '0'), 'hex'),
  ]);
  const digestPoint = hashToPoint(STAKING_DOMAIN_SEPARATOR, pk1Bytes);

  // Compute proof of possession: signature = privateKey * digestPoint
  const signature = digestPoint.multiply(privateKey);
  const signatureAffine = signature.toAffine();

  return {
    attester: operator.attester.toString(),
    withdrawer: operator.withdrawer.toString(),
    publicKeyInG1: {
      x: publicKeyG1Affine.x.toString(),
      y: publicKeyG1Affine.y.toString(),
    },
    publicKeyInG2: {
      x0: publicKeyG2Affine.x.c0.toString(),
      x1: publicKeyG2Affine.x.c1.toString(),
      y0: publicKeyG2Affine.y.c0.toString(),
      y1: publicKeyG2Affine.y.c1.toString(),
    },
    proofOfPossession: {
      x: signatureAffine.x.toString(),
      y: signatureAffine.y.toString(),
    },
  };
}

/**
 * Hash to point implementation matching BN254Lib.hashToPoint in Solidity.
 * Maps arbitrary data to a point on the BN254 G1 curve.
 */
function hashToPoint(domain: string, message: Buffer): typeof bn254.G1.ProjectivePoint.BASE {
  const domainBytes = Buffer.from(domain);
  const Fp = bn254.fields.Fp;

  let attempts = 0n;
  while (true) {
    // x = keccak256(domain, message, attempts) mod p
    const preimage = Buffer.concat([domainBytes, message, Buffer.from(attempts.toString(16).padStart(64, '0'), 'hex')]);

    // Use keccak256 hash
    const hash = keccak256(preimage);
    const x = BigInt('0x' + hash.toString('hex')) % Fp.ORDER;
    attempts++;

    if (x >= Fp.ORDER) {
      continue;
    }

    // y^2 = x^3 + 3 (BN254 curve equation: y^2 = x^3 + b where b = 3)
    const x3 = Fp.mul(Fp.mul(x, x), x);
    const y2 = Fp.add(x3, 3n);

    // Try to compute sqrt
    const y = Fp.sqrt(y2);
    if (y !== undefined) {
      // Deterministically choose between y and -y
      const y0 = y < Fp.ORDER - y ? y : Fp.ORDER - y;
      const y1 = Fp.ORDER - y0;

      // Use additional hash to determine which root to use
      const bPreimage = Buffer.concat([
        domainBytes,
        message,
        Buffer.from(
          BigInt(2n ** 256n - 1n)
            .toString(16)
            .padStart(64, '0'),
          'hex',
        ),
      ]);
      const bHash = keccak256(bPreimage);
      const b = BigInt('0x' + bHash.toString('hex'));

      const finalY = (b & 1n) === 0n ? y0 : y1;
      return bn254.G1.ProjectivePoint.fromAffine({ x, y: finalY });
    }
  }
}

/**
 * Keccak256 hash returning a Buffer.
 */
function keccak256(data: Buffer): Buffer {
  const hash = viemKeccak256(data);
  return Buffer.from(hash.slice(2), 'hex');
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

  // Build the config, computing registration tuples for any initial validators
  const config: L1ContractsJsonConfig = { ...options.config };

  // If initial validators are provided, compute their registration tuples
  if (options.initialValidators && options.initialValidators.length > 0) {
    logger.info(`Computing registration tuples for ${options.initialValidators.length} initial validators`);
    config.initialValidators = options.initialValidators.map(operator => {
      const tuple = computeRegistrationTuple(operator);
      logger.verbose(`Computed registration tuple for validator ${tuple.attester}`);
      return tuple;
    });
  }

  // Build JSON config string to pass as script parameter
  // DeploymentConfig.sol parses the JSON and applies defaults for missing values
  const jsonConfigStr = stringifyConfig(config);

  const useMockVerifier = config.deployment?.useMockVerifier !== false;
  logger.info(`Using ${useMockVerifier ? 'MockVerifier' : 'HonkVerifier'}`);
  logger.verbose('Forge deployment config', jsonConfigStr);

  const result = await runForgeScript(
    [
      'script',
      'script/deploy/rollup/DeployL1Contracts.s.sol',
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
  const stakingAssetHandlerAddress: string | undefined = addresses.stakingAssetHandlerAddress;
  const zkPassportVerifierAddress: string | undefined = addresses.zkPassportVerifierAddress;

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

  logger.info('Forge script completed successfully');

  return {
    l1Client,
    l1ContractAddresses,
    rollupVersion: Number(rollupVersion),
  };
}
