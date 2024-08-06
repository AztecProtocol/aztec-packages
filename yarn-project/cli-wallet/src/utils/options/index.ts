import { parseAztecAddress } from '@aztec/cli/utils';

import { Option } from 'commander';
import { readdir, stat } from 'fs/promises';

import { WalletDB } from '../../storage/wallet_db.js';
import { AccountTypes } from '../accounts.js';

const TARGET_DIR = 'target';

export const ARTIFACT_DESCRIPTION =
  "Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract";

export function createAliasOption(allowAddress: boolean, description: string, hide: boolean) {
  return new Option(`-a, --alias${allowAddress ? '-or-address' : ''} <string>`, description).hideHelp(hide);
}

export function createTypeOption(mandatory: boolean) {
  return new Option('-t, --type <string>', 'Type of account to create')
    .choices(AccountTypes)
    .conflicts('alias-or-address')
    .makeOptionMandatory(mandatory);
}

export function createArgsOption(isConstructor: boolean, db?: WalletDB) {
  return new Option('--args [args...]', `${isConstructor ? 'Constructor' : 'Function'}  arguments`)
    .argParser((arg, prev: string[]) => {
      const next = db?.retrieveAlias(arg) || arg;
      prev.push(next);
      return prev;
    })
    .default([]);
}

export function createContractAddressOption(db?: WalletDB) {
  return new Option('-ca, --contract-address <address>', 'Aztec address of the contract.')
    .argParser(address => {
      const rawAddress = db ? db.retrieveAlias(address) : address;
      return parseAztecAddress(rawAddress);
    })
    .makeOptionMandatory(true);
}

export async function artifactPathParser(filePath: string) {
  const isArtifactPath = new RegExp(/^(\.|\/|[A-Z]:).*\.json$/).test(filePath);
  if (!isArtifactPath) {
    const [pkg, contractName] = filePath.split('@');
    return contractArtifactFromWorkspace(pkg, contractName);
  }
  if (!filePath) {
    throw new Error(
      'This command has to be called from a nargo workspace or contract artifact path should be provided',
    );
  }
  return Promise.resolve(filePath);
}

export function createArtifactOption() {
  return new Option('-c, --contract-artifact <fileLocation>', ARTIFACT_DESCRIPTION).argParser(artifactPathParser);
}

async function contractArtifactFromWorkspace(pkg?: string, contractName?: string) {
  const cwd = process.cwd();
  await stat(`${cwd}/Nargo.toml`);
  const filesInTarget = await readdir(`${cwd}/${TARGET_DIR}`);
  const bestMatch = filesInTarget.filter(file => {
    if (pkg && contractName) {
      return file === `${pkg}-${contractName}.json`;
    } else {
      return file.endsWith('.json') && (file.includes(pkg || '') || file.includes(contractName || ''));
    }
  });
  if (bestMatch.length === 0) {
    throw new Error('No contract artifacts found in target directory with the specified criteria');
  } else if (bestMatch.length > 1) {
    throw new Error(
      `Multiple contract artifacts found in target directory with the specified criteria ${bestMatch.join(', ')}`,
    );
  }
  return `${cwd}/${TARGET_DIR}/${bestMatch[0]}`;
}

export * from './fees.js';
