import {
  type ContractArtifact,
  type FunctionAbi,
  FunctionType,
  getAllFunctionAbis,
  loadContractArtifact,
} from '@aztec/aztec.js/abi';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import type { NoirPackageConfig } from '@aztec/foundation/noir';
import { protocolContractsHash } from '@aztec/protocol-contracts';

import TOML from '@iarna/toml';
import { readFile } from 'fs/promises';
import type { HDAccount, Hex, PrivateKeyAccount } from 'viem';

import { encodeArgs } from './encoding.js';

const logger = createLogger('cli:utils:aztec');

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

export async function deployNewRollupContracts(
  registryAddress: EthAddress,
  rpcUrls: string[],
  privateKey: string | undefined,
  chainId: number,
  mnemonic: string,
  mnemonicIndex: number,
  initialValidators: Operator[],
  genesisArchiveRoot: Fr,
  feeJuicePortalInitialBalance: bigint,
  config: L1ContractsConfig,
  realVerifier: boolean,
): Promise<{ rollup: RollupContract }> {
  const { deployRollupForUpgrade } = await import('@aztec/ethereum/deploy-aztec-l1-contracts');
  const { mnemonicToAccount, privateKeyToAccount } = await import('viem/accounts');
  const { getVKTreeRoot } = await import('@aztec/noir-protocol-circuits-types/vk-tree');

  let account: HDAccount | PrivateKeyAccount;
  if (privateKey) {
    account = privateKeyToAccount(addLeadingHex(privateKey));
  } else {
    account = mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex });
    const privateKeyBuf = account.getHdKey().privateKey;
    const privateKeyHex = Buffer.from(privateKeyBuf!).toString('hex');
    privateKey = `0x${privateKeyHex}`;
  }

  if (!initialValidators || initialValidators.length === 0) {
    // initialize the new rollup with Amin's validator address.
    const aminAddressString = '0x3b218d0F26d15B36C715cB06c949210a0d630637';
    const amin = EthAddress.fromString(aminAddressString);

    initialValidators = [
      {
        attester: amin,
        withdrawer: amin,
        // No secrets here. The actual keys are not currently used.
        bn254SecretKey: new SecretValue(Fr.fromHexString(aminAddressString).toBigInt()),
      },
    ];
    logger.info('Initializing new rollup with old attesters', { initialValidators });
  }

  const { rollup } = await deployRollupForUpgrade(privateKey as Hex, rpcUrls[0], chainId, registryAddress, {
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
    genesisArchiveRoot,
    initialValidators,
    feeJuicePortalInitialBalance,
    realVerifier,
    ...config,
  });

  return { rollup };
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
export const stripLeadingHex = (hex: string): string => {
  if (hex.length > 2 && hex.startsWith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

/**
 * Adds a leading 0x to a hex string. If a leading 0x is already present the string is returned unchanged.
 * @param hex - A hex string
 * @returns A new string with leading 0x added
 */
export const addLeadingHex = (hex: string): `0x${string}` => {
  if (hex.length > 2 && hex.startsWith('0x')) {
    return hex as `0x${string}`;
  }
  return `0x${hex}`;
};

/*
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
