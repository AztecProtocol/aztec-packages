import { prettyPrintJSON } from '@aztec/cli/utils';
import { GSEContract, createEthereumChain } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { wordlist } from '@scure/bip39/wordlists/english.js';
import { writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { createPublicClient, fallback, http } from 'viem';
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
import { processAttesterAccounts } from './staker.js';
import {
  validateBlsPathOptions,
  validatePublisherOptions,
  validateRemoteSignerOptions,
  validateStakerOutputOptions,
} from './utils.js';

export type NewValidatorKeystoreOptions = {
  dataDir?: string;
  file?: string;
  count?: number;
  publisherCount?: number;
  publishers?: string[];
  mnemonic?: string;
  passphrase?: string;
  accountIndex?: number;
  addressIndex?: number;
  separatePublisher?: boolean;
  ikm?: string;
  blsPath?: string;
  password?: string;
  encryptedKeystoreDir?: string;
  json?: boolean;
  feeRecipient: AztecAddress;
  coinbase?: EthAddress;
  remoteSigner?: string;
  stakerOutput?: boolean;
  gseAddress?: EthAddress;
  l1RpcUrls?: string[];
  l1ChainId?: number;
};

export async function newValidatorKeystore(options: NewValidatorKeystoreOptions, log: LogFn) {
  // validate bls-path inputs before proceeding with key generation
  validateBlsPathOptions(options);
  // validate staker output options before proceeding with key generation
  validateStakerOutputOptions(options);
  // validate publisher options
  validatePublisherOptions(options);
  // validate remote signer options
  validateRemoteSignerOptions(options);

  const {
    dataDir,
    file,
    count,
    publisherCount = 0,
    publishers,
    json,
    coinbase,
    accountIndex = 0,
    addressIndex = 0,
    feeRecipient,
    remoteSigner,
    blsPath,
    ikm,
    mnemonic: _mnemonic,
    password,
    encryptedKeystoreDir,
    stakerOutput,
    gseAddress,
    l1RpcUrls,
    l1ChainId,
  } = options;

  const mnemonic = _mnemonic ?? generateMnemonic(wordlist);

  if (!_mnemonic && !json) {
    log('No mnemonic provided, generating new one...');
    log(`Using new mnemonic:`);
    log('');
    log(mnemonic);
    log('');
  }

  const validatorCount = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const { outputPath } = await resolveKeystoreOutputPath(dataDir, file);
  const keystoreOutDir = dirname(outputPath);

  const { validators, summaries } = await buildValidatorEntries({
    validatorCount,
    publisherCount,
    publishers,
    accountIndex,
    baseAddressIndex: addressIndex,
    mnemonic,
    ikm,
    blsPath,
    feeRecipient,
    coinbase,
    remoteSigner,
  });

  // If password provided, write ETH JSON V3 and BLS BN254 keystores and replace plaintext
  if (password !== undefined) {
    const encryptedKeystoreOutDir =
      encryptedKeystoreDir && encryptedKeystoreDir.length > 0 ? encryptedKeystoreDir : keystoreOutDir;
    await writeEthJsonV3ToFile(validators, { outDir: encryptedKeystoreOutDir, password });
    await writeBlsBn254ToFile(validators, { outDir: encryptedKeystoreOutDir, password });
  }

  const keystore = {
    schemaVersion: 1,
    validators,
  };

  await writeKeystoreFile(outputPath, keystore);

  // Generate staker outputs if requested
  const allStakerOutputs: any[] = [];
  if (stakerOutput && gseAddress && l1RpcUrls && l1ChainId !== undefined) {
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(l1RpcUrls.map(url => http(url))),
    });
    const gse = new GSEContract(publicClient, gseAddress);

    // Extract keystore base name without extension for unique staker output filenames
    const keystoreBaseName = basename(outputPath, '.json');

    // Process each validator
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      const outputs = await processAttesterAccounts(validator.attester, gse, password);

      // Collect all staker outputs
      for (let j = 0; j < outputs.length; j++) {
        allStakerOutputs.push(outputs[j]);
      }
    }

    // Write a single JSON file with all staker outputs
    if (allStakerOutputs.length > 0) {
      const stakerOutputPath = join(keystoreOutDir, `${keystoreBaseName}_staker_output.json`);
      await writeFile(stakerOutputPath, prettyPrintJSON(allStakerOutputs), 'utf-8');
    }
  }

  const outputData = !_mnemonic ? { ...keystore, generatedMnemonic: mnemonic } : keystore;

  // Handle JSON output
  if (json) {
    if (stakerOutput && allStakerOutputs.length > 0) {
      const combinedOutput = {
        keystore: outputData,
        staker: allStakerOutputs,
      };
      maybePrintJson(log, json, combinedOutput as unknown as Record<string, any>);
    } else {
      maybePrintJson(log, json, outputData as unknown as Record<string, any>);
    }
  } else {
    log(`Wrote validator keystore to ${outputPath}`);
    if (stakerOutput && allStakerOutputs.length > 0) {
      const keystoreBaseName = basename(outputPath, '.json');
      const stakerOutputPath = join(keystoreOutDir, `${keystoreBaseName}_staker_output.json`);
      log(`Wrote staker output for ${allStakerOutputs.length} validator(s) to ${stakerOutputPath}`);
      log('');
    }
  }

  // print a concise summary of public keys (addresses and BLS pubkeys) if no --json options was selected
  if (!json) {
    logValidatorSummaries(log, summaries);
  }

  if (mnemonic && remoteSigner && !json) {
    for (let i = 0; i < validatorCount; i++) {
      const addrIdx = addressIndex + i;
      const acct = mnemonicToAccount(mnemonic, {
        accountIndex,
        addressIndex: addrIdx,
      });
      log(`attester address: ${acct.address} remoteSignerUrl: ${remoteSigner}`);
    }
  }

  // Log staker outputs if not in JSON mode
  if (!json && stakerOutput && allStakerOutputs.length > 0) {
    log('\nStaker outputs:');
    log(prettyPrintJSON(allStakerOutputs));
  }
}
