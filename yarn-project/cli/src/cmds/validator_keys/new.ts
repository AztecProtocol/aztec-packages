import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { wordlist } from '@scure/bip39/wordlists/english.js';
import { dirname } from 'path';
import { generateMnemonic, mnemonicToAccount } from 'viem/accounts';

import {
  buildValidatorEntries,
  logValidatorSummaries,
  maybePrintJson,
  resolveKeystoreOutputPath,
  writeBlsBn254ToFile,
  writeEthJsonV3ToFile,
  writeKeystoreFile,
} from './shared.js';

export type NewValidatorKeystoreOptions = {
  dataDir?: string;
  file?: string;
  count?: number;
  publisherCount?: number;
  mnemonic?: string;
  passphrase?: string;
  accountIndex?: number;
  addressIndex?: number;
  separatePublisher?: boolean;
  ikm?: string;
  blsPath?: string;
  blsOnly?: boolean;
  password?: string;
  outDir?: string;
  json?: boolean;
  feeRecipient: AztecAddress;
  coinbase?: EthAddress;
  remoteSigner?: string;
  fundingAccount?: EthAddress;
};

export async function newValidatorKeystore(options: NewValidatorKeystoreOptions, log: LogFn) {
  const {
    dataDir,
    file,
    count,
    publisherCount = 0,
    json,
    coinbase,
    accountIndex = 0,
    addressIndex = 0,
    feeRecipient,
    remoteSigner,
    fundingAccount,
    blsOnly,
    blsPath,
    ikm,
    mnemonic: _mnemonic,
    password,
    outDir,
  } = options;

  if (remoteSigner && !_mnemonic) {
    throw new Error(
      'Using --remote-signer requires a deterministic key source. Provide --mnemonic to derive keys, or omit --remote-signer to write new private keys to keystore.',
    );
  }

  const mnemonic = _mnemonic ?? generateMnemonic(wordlist);

  const validatorCount = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const { outputPath } = await resolveKeystoreOutputPath(dataDir, file);

  const { validators, summaries } = await buildValidatorEntries({
    validatorCount,
    publisherCount,
    accountIndex,
    baseAddressIndex: addressIndex,
    mnemonic,
    ikm,
    blsPath,
    blsOnly,
    feeRecipient,
    coinbase,
    remoteSigner,
    fundingAccount,
  });

  // If password provided, write ETH JSON V3 and BLS BN254 keystores and replace plaintext
  if (password !== undefined) {
    const keystoreOutDir = outDir && outDir.length > 0 ? outDir : dirname(outputPath);
    await writeEthJsonV3ToFile(validators, { outDir: keystoreOutDir, password });
    await writeBlsBn254ToFile(validators, { outDir: keystoreOutDir, password });
  }

  const keystore = {
    schemaVersion: 1,
    validators,
  };

  await writeKeystoreFile(outputPath, keystore);

  maybePrintJson(log, json, keystore as unknown as Record<string, any>);
  if (!json) {
    log(`Wrote validator keystore to ${outputPath}`);
  }

  // Always print a concise summary of public keys (addresses and BLS pubkeys)
  logValidatorSummaries(log, summaries);

  if (!blsOnly && mnemonic && remoteSigner) {
    for (let i = 0; i < validatorCount; i++) {
      const addrIdx = addressIndex + i;
      const acct = mnemonicToAccount(mnemonic, {
        accountIndex,
        addressIndex: addrIdx,
      });
      log(`attester address: ${acct.address} remoteSignerUrl: ${remoteSigner}`);
    }
  }
}
