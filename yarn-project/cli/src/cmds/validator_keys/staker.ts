import { prettyPrintJSON } from '@aztec/cli/utils';
import { GSEContract, createEthereumChain } from '@aztec/ethereum';
import { computeBn254G1PublicKey, computeBn254G2PublicKey } from '@aztec/foundation/crypto';
import { decryptBn254Keystore } from '@aztec/foundation/crypto/bls/bn254_keystore';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import { loadKeystoreFile } from '@aztec/node-keystore/loader';
import type {
  AttesterAccount,
  AttesterAccounts,
  BLSAccount,
  EncryptedKeyFileConfig,
  EthAccount,
  MnemonicConfig,
} from '@aztec/node-keystore/types';

import { Wallet } from '@ethersproject/wallet';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { createPublicClient, fallback, http } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

export type StakerOptions = {
  from: string;
  password?: string;
  output?: string;
  gseAddress: EthAddress;
  l1RpcUrls: string[];
  l1ChainId: number;
};

export type StakerOutput = {
  attester: string;
  publicKeyG1: {
    x: string;
    y: string;
  };
  publicKeyG2: {
    x0: string;
    x1: string;
    y0: string;
    y1: string;
  };
  proofOfPossession: {
    x: string;
    y: string;
  };
};

/**
 * Check if an object is a MnemonicConfig
 */
function isMnemonicConfig(obj: unknown): obj is MnemonicConfig {
  return typeof obj === 'object' && obj !== null && 'mnemonic' in obj;
}

/**
 * Check if a value is an encrypted keystore file config
 */
function isEncryptedKeyFileConfig(value: unknown): value is EncryptedKeyFileConfig {
  return typeof value === 'object' && value !== null && 'path' in value;
}

/**
 * Check if a BLSAccount is a private key string (not an encrypted keystore file)
 */
function isBlsPrivateKey(bls: unknown): bls is string {
  return typeof bls === 'string' && bls.startsWith('0x');
}

/**
 * Check if an EthAccount is a private key string (66 chars: 0x + 64 hex)
 */
function isEthPrivateKey(eth: unknown): eth is string {
  return typeof eth === 'string' && eth.startsWith('0x') && eth.length === 66;
}

/**
 * Check if a string is an Ethereum address (42 chars: 0x + 40 hex)
 */
function isEthAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Decrypt a BLS private key from an encrypted keystore file
 */
function decryptBlsKey(bls: BLSAccount, password?: string): string | undefined {
  if (isBlsPrivateKey(bls)) {
    return bls;
  }

  if (isEncryptedKeyFileConfig(bls)) {
    if (!password && !bls.password) {
      return undefined; // Can't decrypt without password
    }
    const pwd = password ?? bls.password!;
    return decryptBn254Keystore(bls.path, pwd);
  }

  return undefined;
}

/**
 * Decrypt an Ethereum private key from an encrypted keystore file
 */
async function decryptEthKey(eth: EthAccount, password?: string): Promise<string | undefined> {
  if (isEthPrivateKey(eth)) {
    return eth;
  }

  if (isEncryptedKeyFileConfig(eth)) {
    if (!password && !eth.password) {
      return undefined; // Can't decrypt without password
    }
    const pwd = password ?? eth.password!;
    const json = readFileSync(eth.path, 'utf-8');
    const wallet = await Wallet.fromEncryptedJson(json, pwd);
    return wallet.privateKey as string;
  }

  return undefined;
}

/**
 * Extract Ethereum address from an EthAccount (or private key)
 */
async function getEthAddress(eth: EthAccount | string, password?: string): Promise<EthAddress | undefined> {
  // Case 1: It's a private key string - derive the address
  if (isEthPrivateKey(eth)) {
    return privateKeyToAddress(eth as `0x${string}`) as unknown as EthAddress;
  }

  // Case 2: It's just an address string directly (EthRemoteSignerAccount can be just EthAddress)
  if (isEthAddress(eth)) {
    return eth as unknown as EthAddress;
  }

  // Case 3: It's an object with an address property (remote signer config)
  if (typeof eth === 'object' && eth !== null && 'address' in eth) {
    return (eth as any).address as EthAddress;
  }

  // Case 4: It's an encrypted keystore file - decrypt and derive address
  if (isEncryptedKeyFileConfig(eth)) {
    const privateKey = await decryptEthKey(eth, password);
    if (privateKey) {
      return privateKeyToAddress(privateKey as `0x${string}`) as unknown as EthAddress;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Extract BLS private key and Ethereum address from an AttesterAccount
 */
async function extractAttesterInfo(
  attester: AttesterAccount,
  password?: string,
): Promise<{ blsPrivateKey?: string; ethAddress?: EthAddress }> {
  // Case 1: attester is { eth: EthAccount, bls?: BLSAccount }
  if (typeof attester === 'object' && attester !== null && 'eth' in attester) {
    const ethAddress = await getEthAddress(attester.eth, password);
    const blsPrivateKey = attester.bls ? decryptBlsKey(attester.bls, password) : undefined;
    return { blsPrivateKey, ethAddress };
  }

  // Case 2: attester is just an EthAccount directly (no BLS key)
  return {
    blsPrivateKey: undefined,
    ethAddress: await getEthAddress(attester as EthAccount, password),
  };
}

/**
 * Process a single attester entry and output staking JSON
 */
async function processAttester(
  attester: AttesterAccount,
  gse: GSEContract,
  password?: string,
): Promise<StakerOutput | undefined> {
  const { blsPrivateKey, ethAddress } = await extractAttesterInfo(attester, password);

  // Skip if no BLS private key or no Ethereum address
  if (!blsPrivateKey || !ethAddress) {
    return undefined;
  }

  // Derive G1 and G2 public keys
  const g1PublicKey = await computeBn254G1PublicKey(blsPrivateKey);
  const g2PublicKey = await computeBn254G2PublicKey(blsPrivateKey);

  // Generate proof of possession
  const bn254SecretKeyFieldElement = Fr.fromString(blsPrivateKey);
  const registrationTuple = await gse.makeRegistrationTuple(bn254SecretKeyFieldElement.toBigInt());

  return {
    attester: String(ethAddress),
    publicKeyG1: {
      x: '0x' + g1PublicKey.x.toString(16).padStart(64, '0'),
      y: '0x' + g1PublicKey.y.toString(16).padStart(64, '0'),
    },
    publicKeyG2: {
      x0: '0x' + g2PublicKey.x.c0.toString(16).padStart(64, '0'),
      x1: '0x' + g2PublicKey.x.c1.toString(16).padStart(64, '0'),
      y0: '0x' + g2PublicKey.y.c0.toString(16).padStart(64, '0'),
      y1: '0x' + g2PublicKey.y.c1.toString(16).padStart(64, '0'),
    },
    proofOfPossession: {
      x: '0x' + registrationTuple.proofOfPossession.x.toString(16),
      y: '0x' + registrationTuple.proofOfPossession.y.toString(16),
    },
  };
}

/**
 * Process AttesterAccounts (which can be a single attester, array, or mnemonic)
 */
export async function processAttesterAccounts(
  attesterAccounts: AttesterAccounts,
  gse: GSEContract,
  password?: string,
): Promise<StakerOutput[]> {
  // Skip mnemonic configs
  if (isMnemonicConfig(attesterAccounts)) {
    return [];
  }

  // Handle array of attesters
  if (Array.isArray(attesterAccounts)) {
    const results: StakerOutput[] = [];
    for (const attester of attesterAccounts) {
      const result = await processAttester(attester, gse, password);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  // Handle single attester
  const result = await processAttester(attesterAccounts, gse, password);
  return result ? [result] : [];
}

/**
 * Main staker command function
 */
export async function generateStakerJson(options: StakerOptions, log: LogFn): Promise<void> {
  const { from, password, gseAddress, l1RpcUrls, l1ChainId, output } = options;

  // Load the keystore file
  const keystore = loadKeystoreFile(from);

  if (!gseAddress) {
    throw new Error('GSE contract address is required');
  }
  log(`Calling GSE contract ${gseAddress} on chain ${l1ChainId}, using ${l1RpcUrls.join(', ')} to get staker outputs`);

  if (!keystore.validators || keystore.validators.length === 0) {
    log('No validators found in keystore');
    return;
  }

  const allOutputs: StakerOutput[] = [];

  // L1 client for proof of possession
  const chain = createEthereumChain(l1RpcUrls, l1ChainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(l1RpcUrls.map(url => http(url))),
  });
  const gse = new GSEContract(publicClient, gseAddress);

  const keystoreBaseName = basename(from, '.json');
  const outputDir = output ? output : dirname(from);

  for (let i = 0; i < keystore.validators.length; i++) {
    const validator = keystore.validators[i];
    const outputs = await processAttesterAccounts(validator.attester, gse, password);

    for (let j = 0; j < outputs.length; j++) {
      allOutputs.push(outputs[j]);
    }
  }

  if (allOutputs.length === 0) {
    log('No attesters with BLS keys found (skipping mnemonics and encrypted keystores without password)');
    return;
  }

  // Write a single JSON file with all staker outputs
  const stakerOutputPath = join(outputDir, `${keystoreBaseName}_staker_output.json`);
  writeFileSync(stakerOutputPath, prettyPrintJSON(allOutputs), 'utf-8');
  log(`Wrote staker output for ${allOutputs.length} validator(s) to ${stakerOutputPath}`);
}
