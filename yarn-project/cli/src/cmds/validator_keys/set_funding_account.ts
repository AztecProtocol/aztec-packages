import type { LogFn } from '@aztec/foundation/log';
import { loadKeystoreFile } from '@aztec/node-keystore/loader';
import type { KeyStore } from '@aztec/node-keystore/types';

import { dirname } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

import { encryptFundingAccountToFile, maybePrintJson, resolveFundingAccount, writeKeystoreFile } from './shared.js';
import { validateFundingAccountOptions } from './utils.js';

export type SetFundingAccountOptions = {
  remoteSigner?: string;
  password?: string;
  encryptedKeystoreDir?: string;
  json?: boolean;
};

/**
 * Sets the top-level funding account of an existing keystore, replacing any previous one. The
 * account may be a private key, or an address paired with a remote signer URL. With a password,
 * a plaintext key is encrypted to an ETH JSON V3 file and stored as a { path, password } reference.
 */
export async function setFundingAccount(
  existing: string,
  fundingAccount: string,
  options: SetFundingAccountOptions,
  log: LogFn,
) {
  const { remoteSigner, password, encryptedKeystoreDir, json } = options;

  const validated = { fundingAccount, remoteSigner };
  validateFundingAccountOptions(validated);

  const keystore: KeyStore = loadKeystoreFile(existing);

  let resolved = resolveFundingAccount(validated.fundingAccount!, remoteSigner);
  if (password !== undefined) {
    const outDir = encryptedKeystoreDir && encryptedKeystoreDir.length > 0 ? encryptedKeystoreDir : dirname(existing);
    resolved = await encryptFundingAccountToFile(resolved, { outDir, password });
  }

  if (keystore.fundingAccount) {
    log('Replacing existing funding account in keystore');
  }
  keystore.fundingAccount = resolved;

  await writeKeystoreFile(existing, keystore);

  if (!json) {
    const value = validated.fundingAccount!;
    const funderAddress = value.length === 66 ? privateKeyToAccount(value as `0x${string}`).address : value;
    log(`Set funding account ${funderAddress} in ${existing}`);
  }
  maybePrintJson(log, !!json, keystore as unknown as Record<string, any>);
}
