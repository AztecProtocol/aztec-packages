import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';

import { wordlist } from '@scure/bip39/wordlists/english';
import { readFile } from 'fs/promises';
import { dirname, isAbsolute, join } from 'path';
import { generateMnemonic } from 'viem/accounts';

import type { NewValidatorKeystoreOptions } from './new.js';
import {
  buildValidatorEntries,
  logValidatorSummaries,
  materializeBlsAsEip2335,
  maybePrintJson,
  writeKeystoreFile,
} from './shared.js';

export type AddValidatorKeysOptions = NewValidatorKeystoreOptions;

export async function addValidatorKeys(existing: string, options: AddValidatorKeysOptions, log: LogFn) {
  const {
    dataDir,
    file,
    count,
    publisherCount = 0,
    mnemonic,
    accountIndex,
    addressIndex,
    ikm,
    blsPath,
    blsOnly,
    json,
    feeRecipient: feeRecipientOpt,
    coinbase: coinbaseOpt,
    fundingAccount: fundingAccountOpt,
    remoteSigner: remoteSignerOpt,
    eip2335,
    password,
    outDir,
  } = options;

  const validatorCount = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const baseAccountIndex = accountIndex ?? 0;
  const baseAddressIndex = addressIndex ?? 0;

  const buf = await readFile(existing, { encoding: 'utf-8' });
  const keystore = JSON.parse(buf) as { schemaVersion: number; validators: any[] };
  if (!keystore || typeof keystore !== 'object' || !Array.isArray((keystore as any).validators)) {
    throw new Error('Invalid keystore JSON: missing validators array');
  }

  const first = keystore.validators[0] ?? {};
  const feeRecipient = feeRecipientOpt ?? first.feeRecipient;
  if (!feeRecipient) {
    throw new Error('feeRecipient is required (either present in existing file or via --fee-recipient)');
  }
  const coinbase = (coinbaseOpt as EthAddress | undefined) ?? (first.coinbase as EthAddress | undefined);
  const fundingAccount =
    (fundingAccountOpt as EthAddress | undefined) ?? (first.fundingAccount as EthAddress | undefined);
  const derivedRemoteSigner = first.attester?.remoteSignerUrl || first.attester?.eth?.remoteSignerUrl;
  const remoteSigner = remoteSignerOpt ?? derivedRemoteSigner;

  // Ensure we always have a mnemonic for key derivation if none was provided
  const mnemonicToUse = mnemonic ?? generateMnemonic(wordlist);

  // If user explicitly provided --address-index, use it as-is. Otherwise, append after existing validators.
  const effectiveBaseAddressIndex =
    addressIndex === undefined ? baseAddressIndex + (keystore.validators?.length ?? 0) : baseAddressIndex;

  const { validators, summaries } = buildValidatorEntries({
    validatorCount,
    publisherCount,
    baseAccountIndex,
    baseAddressIndex: effectiveBaseAddressIndex,
    mnemonic: mnemonicToUse,
    ikm,
    blsPath,
    blsOnly,
    feeRecipient,
    coinbase,
    remoteSigner,
    fundingAccount,
  });

  keystore.validators.push(...validators);

  // If requested, materialize BLS keys into EIP-2335 files and replace in keystore
  if (eip2335) {
    if (!password || password.length === 0) {
      throw new Error('Password is required when using --eip2335');
    }
    const targetDir =
      outDir && outDir.length > 0 ? outDir : dataDir && dataDir.length > 0 ? dataDir : dirname(existing);
    await materializeBlsAsEip2335(keystore.validators as unknown as any[], { outDir: targetDir, password });
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
