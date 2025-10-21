import { prettyPrintJSON } from '@aztec/cli/utils';
import { deriveBlsKeyFromEntropy, deriveBlsKeyFromMnemonic } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { BLS12Fr, BLS12Point } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import type { EthAccount, EthPrivateKey } from '@aztec/node-keystore/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { createCipheriv, createHash, pbkdf2Sync, randomBytes, randomUUID } from 'crypto';
import { constants as fsConstants, mkdirSync } from 'fs';
import { access, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

export type ValidatorSummary = { attesterEth?: string; attesterBls?: string; publisherEth?: string[] };

export type BuildValidatorsInput = {
  validatorCount: number;
  publisherCount?: number;
  baseAccountIndex: number;
  baseAddressIndex: number;
  mnemonic: string;
  ikm?: string;
  blsPath?: string;
  blsOnly?: boolean;
  feeRecipient: AztecAddress;
  coinbase?: EthAddress;
  remoteSigner?: string;
  fundingAccount?: EthAddress;
};

export function withValidatorIndex(path: string, index: number) {
  const parts = path.split('/');
  if (parts.length >= 4 && parts[0] === 'm' && parts[1] === '12381' && parts[2] === '3600') {
    parts[3] = String(index);
    return parts.join('/');
  }
  return path;
}

export function deriveBlsPrivateKey(mnemonic: string | undefined, ikm: string | undefined, path: string) {
  if (ikm) {
    return deriveBlsKeyFromEntropy(ikm, path);
  }
  if (!mnemonic) {
    throw new Error('Either mnemonic or ikm must be provided for BLS derivation');
  }
  return deriveBlsKeyFromMnemonic(mnemonic, path);
}

export function computeBlsPublicKeyCompressed(privateKeyHex: string) {
  return '0x' + BLS12Point.ONE.mul(BLS12Fr.fromHexString(privateKeyHex)).compress().toString('hex');
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

export function buildValidatorEntries(input: BuildValidatorsInput) {
  const {
    validatorCount,
    publisherCount = 0,
    baseAccountIndex,
    baseAddressIndex,
    mnemonic,
    ikm,
    blsPath,
    blsOnly,
    feeRecipient,
    coinbase,
    remoteSigner,
    fundingAccount,
  } = input;

  const defaultBlsPath = 'm/12381/3600/0/0/0';
  const summaries: ValidatorSummary[] = [];

  const validators = Array.from({ length: validatorCount }, (_unused, i) => {
    const addressIndex = baseAddressIndex + i;
    const basePath = blsPath ?? defaultBlsPath;
    const perValidatorPath = withValidatorIndex(basePath, addressIndex);

    const blsPrivKey = blsOnly || ikm || mnemonic ? deriveBlsPrivateKey(mnemonic, ikm, perValidatorPath) : undefined;
    const blsPubCompressed = blsPrivKey ? computeBlsPublicKeyCompressed(blsPrivKey) : undefined;

    if (blsOnly) {
      const attester = { bls: blsPrivKey! } as unknown as EthAccount;
      summaries.push({ attesterBls: blsPubCompressed });
      return { attester, feeRecipient };
    }

    const ethAttester = deriveEthAttester(mnemonic, baseAccountIndex, addressIndex, remoteSigner);
    const attester = blsPrivKey ? { eth: ethAttester, bls: blsPrivKey } : ethAttester;

    let publisherField: EthAccount | EthPrivateKey | (EthAccount | EthPrivateKey)[] | undefined;
    const publisherAddresses: string[] = [];
    if (publisherCount > 0) {
      const publishersBaseIndex = baseAddressIndex + validatorCount + i * publisherCount;
      const publisherAccounts = Array.from({ length: publisherCount }, (_unused2, j) => {
        const publisherIndex = publishersBaseIndex + j;
        const pubAcct = mnemonicToAccount(mnemonic, {
          accountIndex: baseAccountIndex,
          addressIndex: publisherIndex,
        });
        publisherAddresses.push(pubAcct.address as unknown as string);
        return remoteSigner
          ? ({ address: pubAcct.address as unknown as EthAddress, remoteSignerUrl: remoteSigner } as EthAccount)
          : (('0x' + Buffer.from(pubAcct.getHdKey().privateKey!).toString('hex')) as EthPrivateKey);
      });
      publisherField = publisherCount === 1 ? publisherAccounts[0] : publisherAccounts;
    }

    const acct = mnemonicToAccount(mnemonic, {
      accountIndex: baseAccountIndex,
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
    };
  });

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
 * Writes an EIP-2335-compatible keystore file for a BN254 BLS private key using PBKDF2 and AES-128-CTR.
 * Returns the absolute path to the written file.
 */
export async function writeEip2335BlsKeystore(
  outDir: string,
  fileNameBase: string,
  password: string,
  privateKeyHex: string,
  pubkeyHex: string,
  derivationPath: string,
): Promise<string> {
  const ensureHex = (hex: string) => hex.replace(/^0x/i, '');
  const privHex = ensureHex(privateKeyHex);
  if (!/^[0-9a-fA-F]{64}$/.test(privHex)) {
    throw new Error('BLS private key must be 32-byte hex');
  }

  mkdirSync(outDir, { recursive: true });

  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const dk = pbkdf2Sync(Buffer.from(password.normalize('NFKD'), 'utf8'), salt, 262144, 32, 'sha256');
  const cipherKey = dk.subarray(0, 16);

  const cipher = createCipheriv('aes-128-ctr', cipherKey, iv);
  const plaintext = Buffer.from(privHex, 'hex');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const checksum = createHash('sha256')
    .update(Buffer.concat([dk.subarray(16, 32), ciphertext]))
    .digest();

  const uuid = randomUUID();

  const keystore = {
    crypto: {
      kdf: {
        function: 'pbkdf2',
        params: { dklen: 32, c: 262144, prf: 'hmac-sha256', salt: salt.toString('hex') },
        message: '',
      },
      checksum: {
        function: 'sha256',
        params: {},
        message: checksum.toString('hex'),
      },
      cipher: {
        function: 'aes-128-ctr',
        params: { iv: iv.toString('hex') },
        message: ciphertext.toString('hex'),
      },
    },
    description: ensureHex(pubkeyHex),
    pubkey: pubkeyHex,
    path: derivationPath ?? '',
    uuid,
    version: 4,
  } as const;

  const safeBase = fileNameBase.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = join(outDir, `keystore-${safeBase}.json`);
  await writeFile(outPath, JSON.stringify(keystore, null, 2), { encoding: 'utf-8' });
  return outPath;
}

/** Replace plaintext BLS keys in validators with { path, password } pointing to EIP-2335 files. */
export async function materializeBlsAsEip2335(
  validators: any[],
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

    const pub = computeBlsPublicKeyCompressed(blsKey);
    const path = 'm/12381/3600/0/0/0';
    const fileBase = `${String(i + 1)}_${pub.slice(2, 18)}`;
    const keystorePath = await writeEip2335BlsKeystore(options.outDir, fileBase, options.password, blsKey, pub, path);

    if (typeof att === 'object') {
      (att as any).bls = { path: keystorePath, password: options.password };
    }
  }
}
