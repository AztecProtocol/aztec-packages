import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import { loadKeystoreFile } from '@aztec/node-keystore/loader';
import type { KeyStore } from '@aztec/node-keystore/types';

import { wordlist } from '@scure/bip39/wordlists/english.js';
import { dirname, isAbsolute, join } from 'path';
import { generateMnemonic } from 'viem/accounts';

import type { NewValidatorKeystoreOptions } from './new.js';
import {
  buildValidatorEntries,
  logValidatorSummaries,
  maybePrintJson,
  validateBlsPathOptions,
  writeBlsBn254ToFile,
  writeEthJsonV3ToFile,
  writeKeystoreFile,
} from './shared.js';

export type AddValidatorKeysOptions = NewValidatorKeystoreOptions;

export async function addValidatorKeys(existing: string, options: AddValidatorKeysOptions, log: LogFn) {
  // validate bls-path inputs before proceeding with key generation
  validateBlsPathOptions(options);

  const {
    dataDir,
    file,
    count,
    publisherCount = 0,
    mnemonic,
    accountIndex = 0,
    addressIndex,
    ikm,
    blsPath,
    json,
    feeRecipient: feeRecipientOpt,
    coinbase: coinbaseOpt,
    fundingAccount: fundingAccountOpt,
    remoteSigner: remoteSignerOpt,
    password,
    encryptedKeystoreDir,
  } = options;

  const validatorCount = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const baseAddressIndex = addressIndex ?? 0;

  const keystore: KeyStore = loadKeystoreFile(existing);

  if (!keystore.validators || !Array.isArray(keystore.validators)) {
    throw new Error('Invalid keystore: missing validators array');
  }

  const first = keystore.validators[0] ?? {};
  const feeRecipient = feeRecipientOpt ?? first.feeRecipient;
  if (!feeRecipient) {
    throw new Error('feeRecipient is required (either present in existing file or via --fee-recipient)');
  }
  const coinbase = (coinbaseOpt as EthAddress | undefined) ?? (first.coinbase as EthAddress | undefined);
  const fundingAccount =
    (fundingAccountOpt as EthAddress | undefined) ?? (first.fundingAccount as EthAddress | undefined);
  const derivedRemoteSigner = (first.attester as any)?.remoteSignerUrl || (first.attester as any)?.eth?.remoteSignerUrl;
  const remoteSigner = remoteSignerOpt ?? derivedRemoteSigner;

  // Ensure we always have a mnemonic for key derivation if none was provided
  const mnemonicToUse = mnemonic ?? generateMnemonic(wordlist);

  // If user explicitly provided --address-index, use it as-is. Otherwise, append after existing validators.
  const effectiveBaseAddressIndex =
    addressIndex === undefined ? baseAddressIndex + keystore.validators.length : baseAddressIndex;

  const { validators, summaries } = await buildValidatorEntries({
    validatorCount,
    publisherCount,
    accountIndex,
    baseAddressIndex: effectiveBaseAddressIndex,
    mnemonic: mnemonicToUse,
    ikm,
    blsPath,
    feeRecipient,
    coinbase,
    remoteSigner,
    fundingAccount,
  });

  keystore.validators.push(...validators);

  // If password provided, write ETH JSON V3 and BLS BN254 keystores and replace plaintext
  if (password !== undefined) {
    let targetDir: string;
    if (encryptedKeystoreDir && encryptedKeystoreDir.length > 0) {
      targetDir = encryptedKeystoreDir;
    } else if (dataDir && dataDir.length > 0) {
      targetDir = dataDir;
    } else {
      targetDir = dirname(existing);
    }
    await writeEthJsonV3ToFile(keystore.validators, { outDir: targetDir, password });
    await writeBlsBn254ToFile(keystore.validators, { outDir: targetDir, password, blsPath });
  }

  let outputPath = existing;
  if (file && file.length > 0) {
    if (isAbsolute(file)) {
      outputPath = file;
    } else if (dataDir && dataDir.length > 0) {
      outputPath = join(dataDir, file);
    } else {
      outputPath = join(dirname(existing), file);
    }
  }

  await writeKeystoreFile(outputPath, keystore);

  if (!json) {
    log(`Updated keystore ${outputPath} with ${validators.length} new validator(s)`);
    logValidatorSummaries(log, summaries);
  }
  maybePrintJson(log, !!json, keystore as unknown as Record<string, any>);
}
