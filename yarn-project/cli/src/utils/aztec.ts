import { EthAddress, type PXE } from '@aztec/aztec.js';
import {
  type ContractArtifact,
  type FunctionAbi,
  FunctionType,
  getAllFunctionAbis,
  loadContractArtifact,
} from '@aztec/aztec.js/abi';
import {
  type DeployL1ContractsReturnType,
  type L1ContractsConfig,
  type Operator,
  RollupContract,
} from '@aztec/ethereum';
import type { Fr } from '@aztec/foundation/fields';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { NoirPackageConfig } from '@aztec/foundation/noir';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import TOML from '@iarna/toml';
import { readFile } from 'fs/promises';
import { gtr, ltr, satisfies, valid } from 'semver';

import { encodeArgs } from './encoding.js';

/**
 * Helper to get an ABI function or throw error if it doesn't exist.
 * @param artifact - Contract's build artifact in JSON format.
 * @param fnName - Function name to be found.
 * @returns The function's ABI.
 */
export function getFunctionAbi(artifact: ContractArtifact, fnName: string): FunctionAbi {
  const fn = getAllFunctionAbis(artifact).find(({ name }) => name === fnName);
  if (!fn) {
    throw Error(`Function ${fnName} not found in contract ABI.`);
  }
  return fn;
}

/**
 * Function to execute the 'deployRollupContracts' command.
 * @param rpcUrls - The RPC URL of the ethereum node.
 * @param chainId - The chain ID of the L1 host.
 * @param privateKey - The private key to be used in contract deployment.
 * @param mnemonic - The mnemonic to be used in contract deployment.
 */
export async function deployAztecContracts(
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  salt: number | undefined,
  initialValidators: Operator[],
  genesisArchiveRoot: Fr,
  feeJuicePortalInitialBalance: bigint,
  acceleratedTestDeployments: boolean,
  config: L1ContractsConfig,
  realVerifier: boolean,
  debugLogger: Logger,
): Promise<DeployL1ContractsReturnType> {
  const { createEthereumChain, deployL1Contracts } = await import('@aztec/ethereum');
  const { mnemonicToAccount, privateKeyToAccount } = await import('viem/accounts');

  const account = !privateKey
    ? mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex })
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const chain = createEthereumChain(rpcUrls, chainId);

  const { getVKTreeRoot } = await import('@aztec/noir-protocol-circuits-types/vk-tree');

  return await deployL1Contracts(
    chain.rpcUrls,
    account,
    chain.chainInfo,
    debugLogger,
    {
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      genesisArchiveRoot,
      salt,
      initialValidators,
      acceleratedTestDeployments,
      feeJuicePortalInitialBalance,
      realVerifier,
      ...config,
    },
    config,
  );
}

export async function deployNewRollupContracts(
  registryAddress: EthAddress,
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  salt: number | undefined,
  initialValidators: Operator[],
  genesisArchiveRoot: Fr,
  feeJuicePortalInitialBalance: bigint,
  config: L1ContractsConfig,
  realVerifier: boolean,
  logger: Logger,
): Promise<{ rollup: RollupContract; slashFactoryAddress: EthAddress }> {
  const { createEthereumChain, deployRollupForUpgrade, createExtendedL1Client } = await import('@aztec/ethereum');
  const { mnemonicToAccount, privateKeyToAccount } = await import('viem/accounts');
  const { getVKTreeRoot } = await import('@aztec/noir-protocol-circuits-types/vk-tree');

  const account = !privateKey
    ? mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex })
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const chain = createEthereumChain(rpcUrls, chainId);
  const client = createExtendedL1Client(rpcUrls, account, chain.chainInfo, undefined, mnemonicIndex);

  if (!initialValidators || initialValidators.length === 0) {
    // initialize the new rollup with Amin's validator address.
    const amin = EthAddress.fromString('0x3b218d0F26d15B36C715cB06c949210a0d630637');
    initialValidators = [{ attester: amin, withdrawer: amin }];
    logger.info('Initializing new rollup with old attesters', { initialValidators });
  }

  const { rollup, slashFactoryAddress } = await deployRollupForUpgrade(
    client,
    {
      salt,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      genesisArchiveRoot,
      initialValidators,
      feeJuicePortalInitialBalance,
      realVerifier,
      ...config,
    },
    registryAddress,
    logger,
    config,
  );

  return { rollup, slashFactoryAddress };
}

/**
 * Gets all contracts available in \@aztec/noir-contracts.js.
 * @returns The contract names.
 */
export async function getExampleContractNames(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { ContractNames } = await import('@aztec/noir-contracts.js');
  return ContractNames;
}

/**
 * Reads a file and converts it to an Aztec Contract ABI.
 * @param fileDir - The directory of the compiled contract ABI.
 * @returns The parsed contract artifact.
 */
export async function getContractArtifact(fileDir: string, log: LogFn) {
  // first check if it's a noir-contracts example
  const allNames = await getExampleContractNames();
  const contractName = fileDir.replace(/Contract(Artifact)?$/, '');
  if (allNames.includes(contractName)) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
    const imported = await import(`@aztec/noir-contracts.js/${contractName}`);
    const artifact = imported[`${contractName}ContractArtifact`] as ContractArtifact;
    if (!artifact) {
      throw Error(`Could not import ${contractName}ContractArtifact from @aztec/noir-contracts.js/${contractName}`);
    }
    return artifact;
  }

  let contents: string;
  try {
    contents = await readFile(fileDir, 'utf8');
  } catch {
    throw Error(`Contract ${fileDir} not found`);
  }

  try {
    return loadContractArtifact(JSON.parse(contents));
  } catch (err) {
    log('Invalid file used. Please try again.');
    throw err;
  }
}

/**
 * Performs necessary checks, conversions & operations to call a contract fn from the CLI.
 * @param contractFile - Directory of the compiled contract ABI.
 * @param functionName - Name of the function to be called.
 * @param _functionArgs - Arguments to call the function with.
 * @param log - Logger instance that will output to the CLI
 * @returns Formatted contract address, function arguments and caller's aztec address.
 */
export async function prepTx(contractFile: string, functionName: string, _functionArgs: string[], log: LogFn) {
  const contractArtifact = await getContractArtifact(contractFile, log);
  const functionArtifact = getFunctionAbi(contractArtifact, functionName);
  const functionArgs = encodeArgs(_functionArgs, functionArtifact.parameters);
  const isPrivate = functionArtifact.functionType === FunctionType.PRIVATE;

  return { functionArgs, contractArtifact, isPrivate };
}

/**
 * Removes the leading 0x from a hex string. If no leading 0x is found the string is returned unchanged.
 * @param hex - A hex string
 * @returns A new string with leading 0x removed
 */
export const stripLeadingHex = (hex: string) => {
  if (hex.length > 2 && hex.startsWith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

/**
 * Pretty prints Nargo.toml contents to a string
 * @param config - Nargo.toml contents
 * @returns The Nargo.toml contents as a string
 */
export function prettyPrintNargoToml(config: NoirPackageConfig): string {
  const withoutDependencies = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'dependencies'));

  const partialToml = TOML.stringify(withoutDependencies);
  const dependenciesToml = Object.entries(config.dependencies).map(([name, dep]) => {
    const depToml = TOML.stringify.value(dep);
    return `${name} = ${depToml}`;
  });

  return partialToml + '\n[dependencies]\n' + dependenciesToml.join('\n') + '\n';
}

/** Mismatch between server and client versions. */
class VersionMismatchError extends Error {}

/**
 * Checks that Private eXecution Environment (PXE) version matches the expected one by this CLI. Throws if not.
 * @param pxe - PXE client.
 * @param expectedVersionRange - Expected version by CLI.
 */
export async function checkServerVersion(pxe: PXE, expectedVersionRange: string) {
  const serverName = 'Aztec Node';
  const { nodeVersion } = await pxe.getNodeInfo();
  if (!nodeVersion) {
    throw new VersionMismatchError(`Couldn't determine ${serverName} version. You may run into issues.`);
  }
  if (!nodeVersion || !valid(nodeVersion)) {
    throw new VersionMismatchError(
      `Missing or invalid version identifier for ${serverName} (${nodeVersion ?? 'empty'}).`,
    );
  } else if (!satisfies(nodeVersion, expectedVersionRange)) {
    if (gtr(nodeVersion, expectedVersionRange)) {
      throw new VersionMismatchError(
        `${serverName} is running version ${nodeVersion} which is newer than the expected by this CLI (${expectedVersionRange}). Consider upgrading your CLI to a newer version.`,
      );
    } else if (ltr(nodeVersion, expectedVersionRange)) {
      throw new VersionMismatchError(
        `${serverName} is running version ${nodeVersion} which is older than the expected by this CLI (${expectedVersionRange}). Consider upgrading your ${serverName} to a newer version.`,
      );
    } else {
      throw new VersionMismatchError(
        `${serverName} is running version ${nodeVersion} which does not match the expected by this CLI (${expectedVersionRange}).`,
      );
    }
  }
}
