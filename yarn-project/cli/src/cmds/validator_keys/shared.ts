import { prettyPrintJSON } from '@aztec/cli/utils';
import { computeBn254G1PublicKeyCompressed, deriveBlsPrivateKey } from '@aztec/foundation/crypto';
import { createBn254Keystore } from '@aztec/foundation/crypto/bls/bn254_keystore';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import type { EthAccount, EthPrivateKey, ValidatorKeyStore } from '@aztec/node-keystore/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { Wallet } from '@ethersproject/wallet';
import { constants as fsConstants, mkdirSync } from 'fs';
import { access, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

export type ValidatorSummary = { attesterEth?: string; attesterBls?: string; publisherEth?: string[] };

export type BuildValidatorsInput = {
  validatorCount: number;
  publisherCount?: number;
  accountIndex: number;
  baseAddressIndex: number;
  mnemonic: string;
  ikm?: string;
  blsPath?: string;
  feeRecipient: AztecAddress;
  coinbase?: EthAddress;
  remoteSigner?: string;
  fundingAccount?: EthAddress;
};

export function withValidatorIndex(path: string, accountIndex: number = 0, addressIndex: number = 0) {
  const parts = path.split('/');
  if (parts.length == 6 && parts[0] === 'm' && parts[1] === '12381' && parts[2] === '3600') {
    parts[3] = String(accountIndex);
    parts[5] = String(addressIndex);
    return parts.join('/');
  }
  return path;
}

/**
 * Compute a compressed BN254 G1 public key from a private key.
 * @param privateKeyHex - Private key as 0x-prefixed hex string
 * @returns Compressed G1 point (32 bytes with sign bit in MSB)
 */
export async function computeBlsPublicKeyCompressed(privateKeyHex: string): Promise<string> {
  return await computeBn254G1PublicKeyCompressed(privateKeyHex);
}

export function deriveEthAttester(
  mnemonic: string,
  baseAccountIndex: number,
  addressIndex: number,
  remoteSigner?: string,
): EthAccount | EthPrivateKey {
  const acct = mnemonicToAccount(mnemonic, { accountIndex: baseAccountIndex, addressIndex });
  return remoteSigner
    ? ({ address: acct.address as unknown as EthAddress, remoteSignerUrl: remoteSigner } as EthAccount)
    : (('0x' + Buffer.from(acct.getHdKey().privateKey!).toString('hex')) as EthPrivateKey);
}

export async function buildValidatorEntries(input: BuildValidatorsInput) {
  const {
    validatorCount,
    publisherCount = 0,
    accountIndex,
    baseAddressIndex,
    mnemonic,
    ikm,
    blsPath,
    feeRecipient,
    coinbase,
    remoteSigner,
    fundingAccount,
  } = input;

  const defaultBlsPath = 'm/12381/3600/0/0/0';
  const summaries: ValidatorSummary[] = [];

  const validators = await Promise.all(
    Array.from({ length: validatorCount }, async (_unused, i) => {
      const addressIndex = baseAddressIndex + i;
      const basePath = blsPath ?? defaultBlsPath;
      const perValidatorPath = withValidatorIndex(basePath, accountIndex, addressIndex);

      const blsPrivKey = ikm || mnemonic ? deriveBlsPrivateKey(mnemonic, ikm, perValidatorPath) : undefined;
      const blsPubCompressed = blsPrivKey ? await computeBlsPublicKeyCompressed(blsPrivKey) : undefined;

      const ethAttester = deriveEthAttester(mnemonic, accountIndex, addressIndex, remoteSigner);
      const attester = blsPrivKey ? { eth: ethAttester, bls: blsPrivKey } : ethAttester;

      let publisherField: EthAccount | EthPrivateKey | (EthAccount | EthPrivateKey)[] | undefined;
      const publisherAddresses: string[] = [];
      if (publisherCount > 0) {
        const publishersBaseIndex = baseAddressIndex + validatorCount + i * publisherCount;
        const publisherAccounts = Array.from({ length: publisherCount }, (_unused2, j) => {
          const publisherAddressIndex = publishersBaseIndex + j;
          const pubAcct = mnemonicToAccount(mnemonic, {
            accountIndex,
            addressIndex: publisherAddressIndex,
          });
          publisherAddresses.push(pubAcct.address as unknown as string);
          return remoteSigner
            ? ({ address: pubAcct.address as unknown as EthAddress, remoteSignerUrl: remoteSigner } as EthAccount)
            : (('0x' + Buffer.from(pubAcct.getHdKey().privateKey!).toString('hex')) as EthPrivateKey);
        });
        publisherField = publisherCount === 1 ? publisherAccounts[0] : publisherAccounts;
      }

      const acct = mnemonicToAccount(mnemonic, {
        accountIndex,
        addressIndex,
      });
      const attesterEthAddress = acct.address as unknown as string;
      summaries.push({
        attesterEth: attesterEthAddress,
        attesterBls: blsPubCompressed,
        publisherEth: publisherAddresses.length > 0 ? publisherAddresses : undefined,
      });

      return {
        attester,
        ...(publisherField !== undefined ? { publisher: publisherField } : {}),
        feeRecipient,
        coinbase,
        fundingAccount,
      } as ValidatorKeyStore;
    }),
  );

  return { validators, summaries };
}

export async function resolveKeystoreOutputPath(dataDir?: string, file?: string) {
  const defaultDataDir = join(homedir(), '.aztec', 'keystore');
  const resolvedDir = dataDir && dataDir.length > 0 ? dataDir : defaultDataDir;
  let outputPath: string;
  if (file && file.length > 0) {
    outputPath = isAbsolute(file) ? file : join(resolvedDir, file);
  } else {
    let index = 1;
    while (true) {
      const candidate = join(resolvedDir, `key${index}.json`);
      try {
        await access(candidate, fsConstants.F_OK);
        index += 1;
      } catch {
        outputPath = candidate;
        break;
      }
    }
  }
  return { resolvedDir, outputPath: outputPath! };
}

export async function writeKeystoreFile(path: string, keystore: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(keystore, null, 2), { encoding: 'utf-8' });
}

export function logValidatorSummaries(log: LogFn, summaries: ValidatorSummary[]) {
  const lines: string[] = [];
  for (let i = 0; i < summaries.length; i++) {
    const v = summaries[i];
    lines.push(`acc${i + 1}:`);
    lines.push(`  attester:`);
    if (v.attesterEth) {
      lines.push(`    eth: ${v.attesterEth}`);
    }
    if (v.attesterBls) {
      lines.push(`    bls: ${v.attesterBls}`);
    }
    if (v.publisherEth && v.publisherEth.length > 0) {
      lines.push(`  publisher:`);
      for (const addr of v.publisherEth) {
        lines.push(`    - ${addr}`);
      }
    }
  }
  if (lines.length > 0) {
    log(lines.join('\n'));
  }
}

export function maybePrintJson(log: LogFn, jsonFlag: boolean | undefined, obj: unknown) {
  if (jsonFlag) {
    log(prettyPrintJSON(obj as Record<string, any>));
  }
}

/**
 * Writes a BN254 keystore file for a BN254 BLS private key.
 * Returns the absolute path to the written file.
 *
 * @param outDir - Directory to write the keystore file to
 * @param fileNameBase - Base name for the keystore file (will be sanitized)
 * @param password - Password for encrypting the private key
 * @param privateKeyHex - Private key as 0x-prefixed hex string (32 bytes)
 * @param pubkeyHex - Public key as hex string
 * @param derivationPath - BIP-44 style derivation path
 * @returns Absolute path to the written keystore file
 */
export async function writeBn254BlsKeystore(
  outDir: string,
  fileNameBase: string,
  password: string,
  privateKeyHex: string,
  pubkeyHex: string,
  derivationPath: string,
): Promise<string> {
  mkdirSync(outDir, { recursive: true });

  const keystore = createBn254Keystore(password, privateKeyHex, pubkeyHex, derivationPath);

  const safeBase = fileNameBase.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = join(outDir, `keystore-${safeBase}.json`);
  await writeFile(outPath, JSON.stringify(keystore, null, 2), { encoding: 'utf-8' });
  return outPath;
}

/** Replace plaintext BLS keys in validators with { path, password } pointing to BN254 keystore files. */
export async function writeBlsBn254ToFile(
  validators: ValidatorKeyStore[],
  options: { outDir: string; password: string },
): Promise<void> {
  for (let i = 0; i < validators.length; i++) {
    const v = validators[i];
    if (!v || typeof v !== 'object' || !('attester' in v)) {
      continue;
    }
    const att = (v as any).attester;

    // Shapes: { bls: <hex> } or { eth: <ethAccount>, bls?: <hex> } or plain EthAccount
    const blsKey: string | undefined = typeof att === 'object' && 'bls' in att ? (att as any).bls : undefined;
    if (!blsKey || typeof blsKey !== 'string') {
      continue;
    }

    const pub = await computeBlsPublicKeyCompressed(blsKey);
    const path = 'm/12381/3600/0/0/0';
    const fileBase = `${String(i + 1)}_${pub.slice(2, 18)}`;
    const keystorePath = await writeBn254BlsKeystore(options.outDir, fileBase, options.password, blsKey, pub, path);

    if (typeof att === 'object') {
      (att as any).bls = { path: keystorePath, password: options.password };
    }
  }
}

/** Writes an Ethereum JSON V3 keystore using ethers, returns absolute path */
export async function writeEthJsonV3Keystore(
  outDir: string,
  fileNameBase: string,
  password: string,
  privateKeyHex: string,
): Promise<string> {
  const safeBase = fileNameBase.replace(/[^a-zA-Z0-9_-]/g, '_');
  mkdirSync(outDir, { recursive: true });
  const wallet = new Wallet(privateKeyHex);
  const json = await wallet.encrypt(password);
  const outPath = join(outDir, `keystore-eth-${safeBase}.json`);
  await writeFile(outPath, json, { encoding: 'utf-8' });
  return outPath;
}

/** Replace plaintext ETH keys in validators with { path, password } pointing to JSON V3 files. */
export async function writeEthJsonV3ToFile(
  validators: ValidatorKeyStore[],
  options: { outDir: string; password: string },
): Promise<void> {
  const maybeEncryptEth = async (account: any, label: string) => {
    if (typeof account === 'string' && account.startsWith('0x') && account.length === 66) {
      const fileBase = `${label}_${account.slice(2, 10)}`;
      const p = await writeEthJsonV3Keystore(options.outDir, fileBase, options.password, account);
      return { path: p, password: options.password };
    }
    return account;
  };

  for (let i = 0; i < validators.length; i++) {
    const v = validators[i];
    if (!v || typeof v !== 'object') {
      continue;
    }

    // attester may be string (eth), object with eth, or remote signer
    const att = (v as any).attester;
    if (typeof att === 'string') {
      (v as any).attester = await maybeEncryptEth(att, `attester_${i + 1}`);
    } else if (att && typeof att === 'object' && 'eth' in att) {
      (att as any).eth = await maybeEncryptEth((att as any).eth, `attester_${i + 1}`);
    }

    // publisher can be single or array
    if ('publisher' in v) {
      const pub = (v as any).publisher;
      if (Array.isArray(pub)) {
        const out: any[] = [];
        for (let j = 0; j < pub.length; j++) {
          out.push(await maybeEncryptEth(pub[j], `publisher_${i + 1}_${j + 1}`));
        }
        (v as any).publisher = out;
      } else if (pub !== undefined) {
        (v as any).publisher = await maybeEncryptEth(pub, `publisher_${i + 1}`);
      }
    }

    // Optional fundingAccount within validator
    if ('fundingAccount' in v) {
      (v as any).fundingAccount = await maybeEncryptEth((v as any).fundingAccount, `funding_${i + 1}`);
    }
  }
}
