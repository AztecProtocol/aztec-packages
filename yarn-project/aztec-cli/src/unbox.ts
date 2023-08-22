// heavily inspired by https://github.com/trufflesuite/truffle/blob/develop/packages/box/lib/utils/unbox.ts
// We download the master branch of the monorepo, and then
// (1) copy "starter-kit" subpackage to the current working directory, into a new subdirectory "starter-kit".
// (2) copy the specified contract from the "noir-contracts" subpackage to into a new subdirectory "starter-kit/noir-contracts",
// (3) copy the specified contract's ABI into the "starter-kit/noir-contracts" subdirectory.
// These will be used by a simple frontend to interact with the contract and deploy to a local sandbox instance of aztec3.
import { LogFn } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import * as path from 'path';

const GITHUB_OWNER = 'AztecProtocol';
const GITHUB_REPO = 'aztec-packages';
const NOIR_CONTRACTS_PATH = 'yarn-project/noir-contracts/src/contracts';
const STARTER_KIT_PATH = 'yarn-project/starter-kit';
// before this commit lands, we can't grab from github, so can test with another subpackage like this
// const STARTER_KIT_PATH = 'yarn-project/aztec.js';

/**
 * Converts a contract name in "upper camel case" to a folder name in snake case.
 * @param contractName - The contract name.
 * @returns The folder name.
 * */
export function contractNameToFolder(contractName: string): string {
  return contractName.replace(/[\w]([A-Z])/g, m => m[0] + '_' + m[1]).toLowerCase();
}

/**
 *
 * @param contractName - The contract name, in upper camel case.
 * @param outputPath - The output path, by default this is the current working directory
 * @returns The path to the downloaded contract.
 */
export async function downloadContractAndStarterKitFromGithub(
  contractName: string = 'PrivateToken',
  outputPath: string,
  log: LogFn,
): Promise<void> {
  // small string conversion, in the ABI the contract name looks like PrivateToken
  // but in the repostory it looks like private_token
  const contractFolder = `${NOIR_CONTRACTS_PATH}/${contractNameToFolder(contractName)}_contract`;
  return await _downloadNoirFilesFromGithub(contractFolder, outputPath, log);
}

/**
 * Not flexible at at all, but quick fix to download a noir smart contract from our
 * monorepo on github.  this will copy over the `yarn-projects/starter-kit` folder in its entirey
 * as well as the specfieid directoryPath, which should point to a single noir contract in
 * `yarn-projects/noir-contracts/src/contracts/...`
 * @param directoryPath - path to the directory in the github repo
 * @param outputPath - local path that we will copy the noir contracts and web3 starter kit to
 * @returns
 */
async function _downloadNoirFilesFromGithub(directoryPath: string, outputPath: string, log: LogFn): Promise<void> {
  const owner = GITHUB_OWNER;
  const repo = GITHUB_REPO;
  // Step 1: Fetch the ZIP from GitHub, hardcoded to the master branch
  const url = `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  // Use JSZip to read the ZIP contents
  const zip = new JSZip();
  const data = await zip.loadAsync(buffer);

  // Step 2: copy the '@aztec/starter-kit' subpackage to the output directory

  const repoDirectoryPrefix = `${repo}-master/`;
  const starterKitPath = `${repoDirectoryPrefix}${STARTER_KIT_PATH}/`;
  const starterDirectories = Object.values(data.files).filter(file => {
    return file.dir && file.name.startsWith(starterKitPath);
  });

  for (const directory of starterDirectories) {
    const relativePath = directory.name.replace(starterKitPath, '');
    const targetPath = `${outputPath}/${relativePath}`;
    await fs.mkdir(targetPath, { recursive: true });
  }
  log('starter directorties are ', starterDirectories);

  const starterFiles = Object.values(data.files).filter(file => {
    return !file.dir && file.name.startsWith(starterKitPath);
  });
  log('starterFiles', starterFiles);

  for (const file of starterFiles) {
    const relativePath = file.name.replace(starterKitPath, '');
    const targetPath = `${outputPath}/${relativePath}`;
    const content = await file.async('nodebuffer');
    await fs.writeFile(targetPath, content);
  }

  // Step 3: copy the noir cointracts to the output directory under subdir /src/contracts/
  const contractDirectoryPath = `${repoDirectoryPrefix}${directoryPath}/`;

  const contractFiles = Object.values(data.files).filter(file => {
    return !file.dir && file.name.startsWith(contractDirectoryPath);
  });

  const contractTargetDirectory = path.join(outputPath, 'src', 'contracts');
  await fs.mkdir(contractTargetDirectory, { recursive: true });
  for (const file of contractFiles) {
    const targetPath = path.join(contractTargetDirectory, path.basename(file.name));

    const content = await file.async('nodebuffer');
    await fs.writeFile(targetPath, content);
    log(`Copied ${file.name} to ${targetPath}`);
  }
}

/**
 * Sets up the .env file for the starter-kit cloned from the monorepo.
 * for standalone front end only react app, only vars prefixed with REACT_APP_ will be available.
 * @param outputPath - path to newly created directory
 * @param contractAbiFileName - copied as-is from the noir-contracts artifacts
 */
export async function createEnvFile(outputPath: string, contractAbiFileName: string) {
  const envData = {
    REACT_APP_CONTRACT_ABI_FILE_NAME: contractAbiFileName,
    REACT_APP_SANDBOX_RPC_URL: '',
    DATABASE_URL: 'mongodb://localhost:27017/mydb',
  };
  const content = Object.entries(envData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const envFilePath = path.join(outputPath, '.env'); // Adjust the path as necessary
  await fs.writeFile(envFilePath, content);
}

/**
 * We pin to "workspace:^" in the package.json for subpackages, but we need to replace it with
 * an the actual version number in the cloned starter kit
 * We modify the copied package.json and pin to the version of the package that was downloaded
 * @param outputPath - directory we are unboxing to
 * @param log - logger
 */
export async function updatePackageJsonVersions(outputPath: string, log: LogFn): Promise<void> {
  const packageJsonPath = path.join(outputPath, 'package.json');
  const fileContent = await fs.readFile(packageJsonPath, 'utf-8');
  const packageData = JSON.parse(fileContent);

  // Check and replace in dependencies
  if (packageData.dependencies) {
    for (const [key, value] of Object.entries(packageData.dependencies)) {
      if (value === 'workspace:^') {
        packageData.dependencies[key] = `^${packageData.version}`;
      }
    }
  }

  // Check and replace in devDependencies
  if (packageData.devDependencies) {
    for (const [key, value] of Object.entries(packageData.devDependencies)) {
      if (value === 'workspace:^') {
        packageData.devDependencies[key] = `^${packageData.version}`;
      }
    }
  }

  // Convert the modified object back to a string
  const updatedContent = JSON.stringify(packageData, null, 2);

  // Write the modified content back to the package.json file
  await fs.writeFile(packageJsonPath, updatedContent);

  log(`Updated package.json versions to ${packageData.version}`);
}
