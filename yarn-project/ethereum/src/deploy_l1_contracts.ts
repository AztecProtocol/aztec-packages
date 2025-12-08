import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import { fileURLToPath } from '@aztec/foundation/url';

import type { Abi, Narrow } from 'abitype';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { addAbortSignal } from 'stream';
import {
  type ContractConstructorArgs,
  type Hex,
  concatHex,
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  numberToHex,
  padHex,
} from 'viem';

import type { L1ContractsConfig } from './config.js';
import { RegistryContract } from './contracts/registry.js';
import { RollupContract } from './contracts/rollup.js';
import { type RollupUpgradeReturnType, computeValidatorData, getL1ContractsPath } from './forge_script.js';
import {
  FeeAssetArtifact,
  FeeAssetHandlerArtifact,
  RegisterNewRollupVersionPayloadArtifact,
  SlashFactoryArtifact,
} from './l1_artifacts.js';
import type { L1ContractAddresses } from './l1_contract_addresses.js';
import {
  type GasPrice,
  type L1TxConfig,
  type L1TxRequest,
  L1TxUtils,
  type L1TxUtilsConfig,
  createL1TxUtilsFromViemWallet,
  getL1TxUtilsConfigEnvVars,
} from './l1_tx_utils/index.js';
import type { ExtendedViemWalletClient } from './types.js';
import { formatViemError } from './utils.js';

export const DEPLOYER_ADDRESS: Hex = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

export type Operator = {
  attester: EthAddress;
  withdrawer: EthAddress;
  bn254SecretKey: SecretValue<bigint>;
};

/**
 * Return type of the deployL1Contract function.
 */
export type DeployL1ContractsReturnType = {
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

export interface DeployL1ContractsArgs extends Omit<L1ContractsConfig, keyof L1TxUtilsConfig> {
  /** The vk tree root. */
  vkTreeRoot: Fr;
  /** The hash of the protocol contracts. */
  protocolContractsHash: Fr;
  /** The genesis root of the archive tree. */
  genesisArchiveRoot: Fr;
  /** The salt for CREATE2 deployment. */
  salt: number | undefined;
  /** The initial validators for the rollup contract. */
  initialValidators?: Operator[];
  /** Configuration for the L1 tx utils module. */
  l1TxConfig?: Partial<L1TxUtilsConfig>;
  /** Enable fast mode for deployments (fire and forget transactions) */
  acceleratedTestDeployments?: boolean;
  /** The initial balance of the fee juice portal. This is the amount of fee juice that is prefunded to accounts */
  feeJuicePortalInitialBalance?: bigint;
  /** Whether to deploy the real verifier or the mock verifier */
  realVerifier: boolean;
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

/**
 * Deploys a new rollup, using the existing canonical version to derive certain values (addresses of assets etc).
 * This function now uses the Forge deployment script (DeployRollupForUpgrade.s.sol).
 *
 * @param extendedClient - The L1 client.
 * @param args - The deployment arguments.
 * @param registryAddress - The address of the registry.
 * @param logger - The logger.
 * @returns The deployed rollup contract and slash factory address.
 */
export const deployRollupForUpgrade = async (
  extendedClient: ExtendedViemWalletClient,
  args: Omit<
    DeployL1ContractsArgs,
    'governanceProposerQuorum' | 'governanceProposerRoundSize' | 'ejectionThreshold' | 'activationThreshold'
  >,
  registryAddress: EthAddress,
  logger: Logger,
) => {
  //   const addresses = await RegistryContract.collectAddresses(extendedClient, registryAddress, 'canonical');

  //   // Import and use the forge deployment function
  //   const { deployRollupUpgradeViaForge } = await import('./forge_script.js');

  // Get RPC URL from the client's transports
  const transport = extendedClient.transport as unknown as { transports?: Array<{ value?: { url?: string } }> };
  const rpcUrl = transport.transports?.[0]?.value?.url ?? extendedClient.chain?.rpcUrls.default.http[0];
  if (!rpcUrl) {
    throw new Error('Could not determine RPC URL from client');
  }

  // Note: We need to get the private key from the account
  // This assumes the account has a source with the private key
  const account = extendedClient.account;
  if (!account || !('source' in account) || (account as { source?: string }).source !== 'privateKey') {
    throw new Error('deployRollupForUpgrade requires a private key account');
  }
  const privateKey = (account as { privateKey?: `0x${string}` }).privateKey;
  if (!privateKey) {
    throw new Error('Could not get private key from account');
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Relative location of l1-contracts in monorepo or docker image.
  const l1ContractsPath = resolve(currentDir, '..', '..', '..', 'l1-contracts');

  const deployWithForge = (outputPath: string): Promise<RollupUpgradeReturnType> => {
    const { promise, resolve, reject } = promiseWithResolvers<RollupUpgradeReturnType>();
    const proc = spawn(
      'forge',
      [
        'script',
        'script/deploy/rollup/DeployRollupForUpgrade.s.sol',
        '--sig',
        'run(string)',
        outputPath,
        '--rpc-url',
        rpcUrl,
        '--private-key',
        privateKey,
        '--broadcast',
        // We don't show stdout on success. On failure, -vvvv shows detailed reverts.
        '-vvvv',
      ],
      {
        cwd: l1ContractsPath,
        env: {
          // Env vars matching l1-contracts/script/deploy/rollup/RollupConfiguration.sol
          REGISTRY_ADDRESS: registryAddress.toString(),
          NETWORK: getActiveNetworkName(),
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
          AZTEC_PROOF_SUBMISSION_EPOCHS: args.aztecProofSubmissionEpochs.toString(),
          AZTEC_MANA_TARGET: args.manaTarget.toString(),
          AZTEC_PROVING_COST_PER_MANA: args.provingCostPerMana.toString(),
          AZTEC_EXIT_DELAY_SECONDS: args.exitDelaySeconds.toString(),
          // Slashing config
          AZTEC_SLASHER_FLAVOR: args.slasherFlavor,
          AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS: args.slashingRoundSizeInEpochs.toString(),
          AZTEC_SLASHING_LIFETIME_IN_ROUNDS: args.slashingLifetimeInRounds.toString(),
          AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS: args.slashingExecutionDelayInRounds.toString(),
          AZTEC_SLASHING_VETOER: args.slashingVetoer.toString(),
          AZTEC_SLASH_AMOUNT_SMALL: args.slashAmountSmall.toString(),
          AZTEC_SLASH_AMOUNT_MEDIUM: args.slashAmountMedium.toString(),
          AZTEC_SLASH_AMOUNT_LARGE: args.slashAmountLarge.toString(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('error', error => {
      reject(new Error(`Failed to spawn forge: ${error.message}`));
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(`Forge script exited with code ${code}\nStandard output:\n${stdout}\nStandard error:\n${stderr}`),
        );
      } else {
        (async () => {
          // Try to parse the output file
          const result: RollupUpgradeReturnType = JSON.parse(await readFile(outputPath, 'utf-8'));
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
  let result: RollupUpgradeReturnType;
  try {
    const outputPath = join(tmpDir, 'rollup-upgrade.json');
    result = await deployWithForge(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  // Create RollupContract wrapper for the deployed rollup
  const rollup = new RollupContract(extendedClient, result.rollupAddress.toString());

  return {
    rollup,
    slashFactoryAddress: EthAddress.fromString(result.slashFactoryAddress),
  };
};

export const deploySlashFactory = async (deployer: L1Deployer, rollupAddress: Hex, logger: Logger) => {
  const slashFactoryAddress = (await deployer.deploy(SlashFactoryArtifact, [rollupAddress])).address;
  logger.verbose(`Deployed SlashFactory at ${slashFactoryAddress}`);
  return slashFactoryAddress;
};

export const deployUpgradePayload = async (
  deployer: L1Deployer,
  addresses: Pick<L1ContractAddresses, 'registryAddress' | 'rollupAddress'>,
) => {
  const payloadAddress = (
    await deployer.deploy(RegisterNewRollupVersionPayloadArtifact, [
      addresses.registryAddress.toString(),
      addresses.rollupAddress.toString(),
    ])
  ).address;

  return payloadAddress;
};

/**
 * Initialize the fee asset handler and make it a minter on the fee asset.
 * @note This function will only be used for testing purposes.
 *
 * @param extendedClient - The L1 clients.
 * @param deployer - The L1 deployer.
 * @param feeAssetAddress - The address of the fee asset.
 * @param logger - The logger.
 */
// eslint-disable-next-line camelcase
export const cheat_initializeFeeAssetHandler = async (
  extendedClient: ExtendedViemWalletClient,
  deployer: L1Deployer,
  feeAssetAddress: EthAddress,
  logger: Logger,
): Promise<{
  feeAssetHandlerAddress: EthAddress;
  txHash: Hex;
}> => {
  const feeAssetHandlerAddress = (
    await deployer.deploy(FeeAssetHandlerArtifact, [
      extendedClient.account.address,
      feeAssetAddress.toString(),
      BigInt(1e18),
    ])
  ).address;
  logger.verbose(`Deployed FeeAssetHandler at ${feeAssetHandlerAddress}`);

  const { txHash } = await deployer.sendTransaction({
    to: feeAssetAddress.toString(),
    data: encodeFunctionData({
      abi: FeeAssetArtifact.contractAbi,
      functionName: 'addMinter',
      args: [feeAssetHandlerAddress.toString()],
    }),
  });
  logger.verbose(`Added fee asset handler ${feeAssetHandlerAddress} as minter on fee asset in ${txHash}`);
  return { feeAssetHandlerAddress, txHash };
};
export class L1Deployer {
  private salt: Hex | undefined;
  private txHashes: Hex[] = [];
  public readonly l1TxUtils: L1TxUtils;
  public readonly verificationRecords: VerificationRecord[] = [];

  constructor(
    public readonly client: ExtendedViemWalletClient,
    maybeSalt: number | undefined,
    dateProvider: DateProvider = new DateProvider(),
    private acceleratedTestDeployments: boolean = false,
    private logger: Logger = createLogger('L1Deployer'),
    private txUtilsConfig?: L1TxUtilsConfig,
    private createVerificationJson: boolean = false,
  ) {
    this.salt = maybeSalt ? padHex(numberToHex(maybeSalt), { size: 32 }) : undefined;
    this.l1TxUtils = createL1TxUtilsFromViemWallet(
      this.client,
      { logger: this.logger, dateProvider },
      { ...this.txUtilsConfig, debugMaxGasLimit: acceleratedTestDeployments },
    );
  }

  async deploy<const TAbi extends Abi>(
    params: ContractArtifacts<TAbi>,
    args?: ContractConstructorArgs<TAbi>,
    opts: { gasLimit?: bigint; noSimulation?: boolean } = {},
  ): Promise<{ address: EthAddress; existed: boolean }> {
    this.logger.debug(`Deploying ${params.name} contract`, { args });
    try {
      const { txHash, address, deployedLibraries, existed } = await deployL1Contract(
        this.client,
        params.contractAbi,
        params.contractBytecode,
        (args ?? []) as readonly unknown[],
        {
          salt: this.salt,
          libraries: params.libraries,
          logger: this.logger,
          l1TxUtils: this.l1TxUtils,
          acceleratedTestDeployments: this.acceleratedTestDeployments,
          gasLimit: opts.gasLimit,
          noSimulation: opts.noSimulation,
        },
      );
      if (txHash) {
        this.txHashes.push(txHash);
      }
      this.logger.debug(`Deployed ${params.name} at ${address}`, { args });

      if (this.createVerificationJson) {
        // Encode constructor args for verification
        let constructorArgsHex: Hex = '0x';
        try {
          const abiItem: any = (params.contractAbi as any[]).find((x: any) => x && x.type === 'constructor');
          const inputDefs: any[] = abiItem && Array.isArray(abiItem.inputs) ? abiItem.inputs : [];
          constructorArgsHex =
            inputDefs.length > 0 ? (encodeAbiParameters(inputDefs as any, (args ?? []) as any) as Hex) : ('0x' as Hex);
        } catch {
          constructorArgsHex = '0x' as Hex;
        }

        this.verificationRecords.push({
          name: params.name,
          address: address.toString(),
          constructorArgsHex,
          libraries: deployedLibraries ?? [],
        });
      }
      return {
        address,
        existed,
      };
    } catch (error) {
      throw new Error(`Failed to deploy ${params.name}`, { cause: formatViemError(error) });
    }
  }

  async waitForDeployments(): Promise<void> {
    if (this.acceleratedTestDeployments) {
      this.logger.info('Accelerated test deployments - skipping waiting for deployments');
      return;
    }
    if (this.txHashes.length === 0) {
      return;
    }

    this.logger.verbose(`Waiting for ${this.txHashes.length} transactions to be mined`, { txHashes: this.txHashes });
    const receipts = await Promise.all(
      this.txHashes.map(txHash => this.client.waitForTransactionReceipt({ hash: txHash })),
    );
    const failed = receipts.filter(r => r.status !== 'success');
    if (failed.length > 0) {
      throw new Error(`Some deployment txs have failed: ${failed.map(f => f.transactionHash).join(', ')}`);
    }
    this.logger.info('All transactions mined successfully', { txHashes: this.txHashes });
  }

  sendTransaction(
    tx: L1TxRequest,
    options?: L1TxConfig,
  ): Promise<{ txHash: Hex; gasLimit: bigint; gasPrice: GasPrice }> {
    return this.l1TxUtils.sendTransaction(tx, options).then(({ txHash, state }) => ({
      txHash,
      gasLimit: state.gasLimit,
      gasPrice: state.gasPrice,
    }));
  }
}

/**
 * Helper function to deploy ETH contracts.
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param abi - The ETH contract's ABI (as abitype's Abi).
 * @param bytecode  - The ETH contract's bytecode.
 * @param args - Constructor arguments for the contract.
 * @param salt - Optional salt for CREATE2 deployment (does not wait for deployment tx to be mined if set, does not send tx if contract already exists).
 * @returns The ETH address the contract was deployed to.
 */
export async function deployL1Contract(
  extendedClient: ExtendedViemWalletClient,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
  opts: {
    salt?: Hex;
    libraries?: Libraries;
    logger?: Logger;
    l1TxUtils?: L1TxUtils;
    gasLimit?: bigint;
    acceleratedTestDeployments?: boolean;
    noSimulation?: boolean;
  } = {},
): Promise<{
  address: EthAddress;
  txHash: Hex | undefined;
  deployedLibraries?: VerificationLibraryEntry[];
  existed: boolean;
}> {
  let txHash: Hex | undefined = undefined;
  let resultingAddress: Hex | null | undefined = undefined;
  const deployedLibraries: VerificationLibraryEntry[] = [];

  const { salt: saltFromOpts, libraries, logger, gasLimit, acceleratedTestDeployments, noSimulation } = opts;
  let { l1TxUtils } = opts;

  if (!l1TxUtils) {
    const config = getL1TxUtilsConfigEnvVars();
    l1TxUtils = createL1TxUtilsFromViemWallet(
      extendedClient,
      { logger },
      { ...config, debugMaxGasLimit: acceleratedTestDeployments },
    );
  }

  if (libraries) {
    // Note that this does NOT work well for linked libraries having linked libraries.

    // Verify that all link references have corresponding code
    for (const linkRef in libraries.linkReferences) {
      for (const contractName in libraries.linkReferences[linkRef]) {
        if (!libraries.libraryCode[contractName]) {
          throw new Error(`Missing library code for ${contractName}`);
        }
      }
    }

    const replacements: Record<string, EthAddress> = {};
    const libraryTxs: Hex[] = [];
    for (const libraryName in libraries?.libraryCode) {
      const lib = libraries.libraryCode[libraryName];
      const { libraries: _libraries, ...optsWithoutLibraries } = opts;
      const { address, txHash } = await deployL1Contract(
        extendedClient,
        lib.contractAbi,
        lib.contractBytecode,
        [],
        optsWithoutLibraries,
      );

      // Log deployed library name and address for easier verification/triage
      logger?.verbose(`Linked library deployed`, { library: libraryName, address: address.toString(), txHash });

      if (txHash) {
        libraryTxs.push(txHash);
      }

      // Try to find the source file for this library from linkReferences
      let fileNameForLibrary: string | undefined = undefined;
      for (const fileName in libraries.linkReferences) {
        if (libraries.linkReferences[fileName] && libraries.linkReferences[fileName][libraryName]) {
          fileNameForLibrary = fileName;
          break;
        }
      }
      if (fileNameForLibrary) {
        deployedLibraries.push({
          file: fileNameForLibrary,
          contract: libraryName,
          address: address.toString(),
        });
      }

      for (const linkRef in libraries.linkReferences) {
        for (const contractName in libraries.linkReferences[linkRef]) {
          // If the library name matches the one we just deployed, we replace it.
          if (contractName !== libraryName) {
            continue;
          }

          // We read the first instance to figure out what we are to replace.
          const start = 2 + 2 * libraries.linkReferences[linkRef][contractName][0].start;
          const length = 2 * libraries.linkReferences[linkRef][contractName][0].length;

          const toReplace = bytecode.slice(start, start + length);
          replacements[toReplace] = address;
        }
      }
    }

    const escapeRegExp = (s: string) => {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special characters
    };

    for (const toReplace in replacements) {
      const replacement = replacements[toReplace].toString().slice(2);
      bytecode = bytecode.replace(new RegExp(escapeRegExp(toReplace), 'g'), replacement) as Hex;
    }

    // Reth fails gas estimation if the deployed contract attempts to call a library that is not yet deployed,
    // so we wait for all library deployments to be mined before deploying the contract.
    // However, if we are in fast mode or using debugMaxGasLimit, we will skip simulation, so we can skip waiting.
    if (libraryTxs.length > 0 && !acceleratedTestDeployments) {
      logger?.verbose(`Awaiting for linked libraries to be deployed`);
      await Promise.all(libraryTxs.map(txHash => extendedClient.waitForTransactionReceipt({ hash: txHash })));
    } else {
      logger?.verbose(
        `Skipping waiting for linked libraries to be deployed ${
          acceleratedTestDeployments ? '(accelerated test deployments)' : ''
        }`,
      );
    }
  }

  let existed = false;

  if (saltFromOpts) {
    logger?.info(`Deploying contract with salt ${saltFromOpts}`);
    const { address, paddedSalt: salt, calldata } = getExpectedAddress(abi, bytecode, args, saltFromOpts);
    resultingAddress = address;
    const existing = await extendedClient.getCode({ address: resultingAddress });
    if (existing === undefined || existing === '0x') {
      if (!noSimulation) {
        try {
          await l1TxUtils.simulate({ to: DEPLOYER_ADDRESS, data: concatHex([salt, calldata]), gas: gasLimit });
        } catch (err) {
          logger?.error(`Failed to simulate deployment tx using universal deployer`, err);
          await l1TxUtils.simulate({ to: null, data: encodeDeployData({ abi, bytecode, args }), gas: gasLimit });
        }
      }
      const res = await l1TxUtils.sendTransaction(
        { to: DEPLOYER_ADDRESS, data: concatHex([salt, calldata]) },
        { gasLimit },
      );
      txHash = res.txHash;

      logger?.verbose(`Deployed contract with salt ${salt} to address ${resultingAddress} in tx ${txHash}.`);
    } else {
      logger?.verbose(`Skipping existing deployment of contract with salt ${salt} to address ${resultingAddress}`);
      existed = true;
    }
  } else {
    const deployData = encodeDeployData({ abi, bytecode, args });
    const { receipt } = await l1TxUtils.sendAndMonitorTransaction(
      {
        to: null,
        data: deployData,
      },
      { gasLimit },
    );

    txHash = receipt.transactionHash;
    resultingAddress = receipt.contractAddress;
    if (!resultingAddress) {
      throw new Error(
        `No contract address found in receipt: ${JSON.stringify(receipt, (_, val) =>
          typeof val === 'bigint' ? String(val) : val,
        )}`,
      );
    }
  }

  return { address: EthAddress.fromString(resultingAddress!), txHash, deployedLibraries, existed };
}

export function getExpectedAddress(
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[],
  salt: Hex,
) {
  const paddedSalt = padHex(salt, { size: 32 });
  const calldata = encodeDeployData({ abi, bytecode, args });
  const address = getContractAddress({
    from: DEPLOYER_ADDRESS,
    salt: paddedSalt,
    bytecode: calldata,
    opcode: 'CREATE2',
  });
  return {
    address,
    paddedSalt,
    calldata,
  };
}
