import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import {
  type Abi,
  type ContractConstructorArgs,
  type Hex,
  type Narrow,
  concatHex,
  encodeAbiParameters,
  encodeDeployData,
  getContractAddress,
  numberToHex,
  padHex,
} from 'viem';

import {
  type ContractArtifacts,
  DEPLOYER_ADDRESS,
  type Libraries,
  type VerificationLibraryEntry,
  type VerificationRecord,
} from './deploy_aztec_l1_contracts.js';
import { RegisterNewRollupVersionPayloadArtifact } from './l1_artifacts.js';
import { type L1TxUtilsConfig, getL1TxUtilsConfigEnvVars } from './l1_tx_utils/config.js';
import { createL1TxUtils } from './l1_tx_utils/factory.js';
import type { L1TxUtils } from './l1_tx_utils/l1_tx_utils.js';
import type { GasPrice, L1TxConfig, L1TxRequest } from './l1_tx_utils/types.js';
import type { ExtendedViemWalletClient } from './types.js';
import { formatViemError } from './utils.js';

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
    this.l1TxUtils = createL1TxUtils(
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
    l1TxUtils = createL1TxUtils(
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

export const deployUpgradePayload = async (
  deployer: L1Deployer,
  addresses: { registryAddress: EthAddress; rollupAddress: EthAddress },
) => {
  const payloadAddress = (
    await deployer.deploy(RegisterNewRollupVersionPayloadArtifact, [
      addresses.registryAddress.toString(),
      addresses.rollupAddress.toString(),
    ])
  ).address;

  return payloadAddress;
};
