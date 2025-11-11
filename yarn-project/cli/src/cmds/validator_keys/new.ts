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
  password?: string;
  outDir?: string;
  json?: boolean;
  feeRecipient: AztecAddress;
  coinbase?: EthAddress;
  remoteSigner?: string;
  fundingAccount?: EthAddress;
  stakerOutput?: boolean;
  gseAddress?: EthAddress;
  l1RpcUrls?: string[];
  l1ChainId?: number;
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
    blsPath,
    ikm,
    mnemonic: _mnemonic,
    password,
    outDir,
    stakerOutput,
    gseAddress,
    l1RpcUrls,
    l1ChainId,
  } = options;

  // Validate staker output requirements
  if (stakerOutput) {
    if (!gseAddress) {
      throw new Error('--gse-address is required when using --staker-output');
    }
    if (!l1RpcUrls || l1RpcUrls.length === 0) {
      throw new Error('--l1-rpc-urls is required when using --staker-output');
    }
    if (l1ChainId === undefined) {
      throw new Error('--l1-chain-id is required when using --staker-output');
    }
  }

  if (remoteSigner && !_mnemonic) {
    throw new Error(
      'Using --remote-signer requires a deterministic key source. Provide --mnemonic to derive keys, or omit --remote-signer to write new private keys to keystore.',
    );
  }

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

  const { validators, summaries } = await buildValidatorEntries({
    validatorCount,
    publisherCount,
    accountIndex,
    baseAddressIndex: addressIndex,
    mnemonic,
    ikm,
    blsPath,
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

  // Generate staker outputs if requested
  const allStakerOutputs: any[] = [];
  if (stakerOutput && gseAddress && l1RpcUrls && l1ChainId !== undefined) {
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(l1RpcUrls.map(url => http(url))),
    });
    const gse = new GSEContract(publicClient, gseAddress);

    const keystoreOutDir = outDir && outDir.length > 0 ? outDir : dirname(outputPath);
    // Extract keystore base name without extension for unique staker output filenames
    const keystoreBaseName = basename(outputPath, '.json');

    // Process each validator
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      const outputs = await processAttesterAccounts(validator.attester, gse, password);

      // Save each attester's staker output
      for (let j = 0; j < outputs.length; j++) {
        const attesterIndex = i + 1;
        const stakerOutputPath = join(
          keystoreOutDir,
          `${keystoreBaseName}_attester${attesterIndex}_staker_output.json`,
        );
        await writeFile(stakerOutputPath, prettyPrintJSON(outputs[j]), 'utf-8');
        allStakerOutputs.push(outputs[j]);
      }
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
      const keystoreOutDir = outDir && outDir.length > 0 ? outDir : dirname(outputPath);
      log(`Wrote ${allStakerOutputs.length} staker output file(s) to ${keystoreOutDir}`);
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
