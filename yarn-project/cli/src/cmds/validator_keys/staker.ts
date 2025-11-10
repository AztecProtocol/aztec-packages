import { Fr } from '@aztec/aztec.js/fields';
import { GSEContract, createEthereumChain } from '@aztec/ethereum';
import { decryptBn254KeystoreFromObject, loadBn254Keystore } from '@aztec/foundation/crypto/bls/bn254_keystore';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import { loadKeystoreFile } from '@aztec/node-keystore/loader';
import type { BLSAccount, KeyStore, ValidatorKeyStore } from '@aztec/node-keystore/types';

import { readFileSync } from 'fs';
import { createPublicClient, fallback, http } from 'viem';

export type StakerOptions = {
  from: string;
  password?: string;
  gseAddress: EthAddress;
  l1RpcUrls: string[];
  chainId: number;
};

export type RegistrationData = {
  attester?: string;
  publicKeyInG1: {
    x: string;
    y: string;
  };
  publicKeyInG2: {
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

type ValidatorEntry = {
  blsPrivateKey: string;
  attesterAddress?: string;
};

/**
 * Extracts BLS private key from various account formats
 */
function extractBlsPrivateKey(blsAccount: BLSAccount, providedPassword?: string): string | undefined {
  // Direct private key string
  if (typeof blsAccount === 'string' && blsAccount.startsWith('0x')) {
    return blsAccount;
  }

  // Encrypted keystore reference
  if (typeof blsAccount === 'object' && 'path' in blsAccount) {
    const keystorePath = blsAccount.path;
    const password = blsAccount.password ?? providedPassword ?? '';

    try {
      // Try loading as BN254 keystore
      const keystore = loadBn254Keystore(keystorePath);
      return decryptBn254KeystoreFromObject(keystore, password);
    } catch (error) {
      throw new Error(`Failed to decrypt BLS keystore at ${keystorePath}: ${error}`);
    }
  }

  return undefined;
}

/**
 * Extracts ETH address from various account formats
 */
function extractEthAddress(ethAccount: any): string | undefined {
  if (typeof ethAccount === 'string' && ethAccount.startsWith('0x')) {
    // This is a private key, we can't easily get the address without deriving it
    // But for the staker command, we only care about the address if it's explicitly provided
    return undefined;
  }

  if (typeof ethAccount === 'object' && 'address' in ethAccount) {
    return ethAccount.address.toString();
  }

  return undefined;
}

/**
 * Processes a single validator entry to extract BLS key and optional attester address
 */
function processValidator(validator: ValidatorKeyStore, providedPassword?: string): ValidatorEntry | undefined {
  const attester = validator.attester;

  let blsPrivateKey: string | undefined;
  let attesterAddress: string | undefined;

  // Handle different attester shapes
  if (typeof attester === 'object' && 'bls' in attester && attester.bls) {
    // Format: { eth: ..., bls: ... }
    blsPrivateKey = extractBlsPrivateKey(attester.bls, providedPassword);
    if ('eth' in attester && attester.eth) {
      attesterAddress = extractEthAddress(attester.eth);
    }
  } else if (typeof attester === 'object' && 'bls' in attester && !('eth' in attester)) {
    // BLS-only format: { bls: ... }
    blsPrivateKey = extractBlsPrivateKey((attester as any).bls, providedPassword);
  } else {
    // Plain ETH account, no BLS key
    return undefined;
  }

  if (!blsPrivateKey) {
    return undefined;
  }

  return {
    blsPrivateKey,
    attesterAddress,
  };
}

/**
 * Generate registration data for staking from BLS private keys
 */
export async function generateRegistrationData(
  blsPrivateKeys: Array<{ privateKey: string; attesterAddress?: string }>,
  gseAddress: EthAddress,
  l1RpcUrls: string[],
  chainId: number,
): Promise<RegistrationData[]> {
  // Create GSE contract client
  const chain = createEthereumChain(l1RpcUrls, chainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(l1RpcUrls.map(url => http(url))),
  });

  const gseContract = new GSEContract(publicClient, gseAddress);

  // Generate registration tuples for all validators
  const registrationData: RegistrationData[] = [];

  for (const entry of blsPrivateKeys) {
    const bn254SecretKeyFieldElement = Fr.fromString(entry.privateKey);
    const registrationTuple = await gseContract.makeRegistrationTuple(bn254SecretKeyFieldElement.toBigInt());

    const data: RegistrationData = {
      publicKeyInG1: {
        x: '0x' + registrationTuple.publicKeyInG1.x.toString(16),
        y: '0x' + registrationTuple.publicKeyInG1.y.toString(16),
      },
      publicKeyInG2: {
        x0: '0x' + registrationTuple.publicKeyInG2.x0.toString(16),
        x1: '0x' + registrationTuple.publicKeyInG2.x1.toString(16),
        y0: '0x' + registrationTuple.publicKeyInG2.y0.toString(16),
        y1: '0x' + registrationTuple.publicKeyInG2.y1.toString(16),
      },
      proofOfPossession: {
        x: '0x' + registrationTuple.proofOfPossession.x.toString(16),
        y: '0x' + registrationTuple.proofOfPossession.y.toString(16),
      },
    };

    // Only include attester field if we have an address
    if (entry.attesterAddress) {
      data.attester = entry.attesterAddress;
    }

    registrationData.push(data);
  }

  return registrationData;
}

export async function stakerCommand(options: StakerOptions, log: LogFn) {
  const { from, password, gseAddress, l1RpcUrls, chainId } = options;

  // Read and parse the keystore file
  let keystoreContent: any;
  try {
    const content = readFileSync(from, 'utf-8');
    keystoreContent = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read keystore file ${from}: ${error}`);
  }

  const validatorEntries: ValidatorEntry[] = [];

  // Detect keystore format and extract validators
  if ('schemaVersion' in keystoreContent && 'validators' in keystoreContent) {
    // Full validator keystore format
    const keystore: KeyStore = loadKeystoreFile(from);
    if (keystore.validators) {
      for (const validator of keystore.validators) {
        const entry = processValidator(validator, password);
        if (entry) {
          validatorEntries.push(entry);
        }
      }
    }
  } else if ('crypto' in keystoreContent) {
    // Encrypted BN254 keystore format
    const decryptedKey = decryptBn254KeystoreFromObject(keystoreContent, password ?? '');
    validatorEntries.push({ blsPrivateKey: decryptedKey });
  } else if ('privateKey' in keystoreContent && 'publicKey' in keystoreContent) {
    // Simple BLS keypair format (from generate-bls-keypair)
    validatorEntries.push({ blsPrivateKey: keystoreContent.privateKey });
  } else {
    throw new Error('Unknown keystore format. Expected validator keystore, BN254 keystore, or BLS keypair JSON.');
  }

  if (validatorEntries.length === 0) {
    throw new Error('No BLS keys found in keystore');
  }

  // Generate registration data using the shared function
  const registrationData = await generateRegistrationData(
    validatorEntries.map(entry => ({
      privateKey: entry.blsPrivateKey,
      attesterAddress: entry.attesterAddress,
    })),
    gseAddress,
    l1RpcUrls,
    chainId,
  );

  // Output as JSON array
  log(JSON.stringify(registrationData, null, 2));
}
