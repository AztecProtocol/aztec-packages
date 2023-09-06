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
// const STARTER_KIT_PATH = 'yarn-project/starter-kit';
// before this commit lands, we can't grab from github, so can test with another subpackage like this
const STARTER_KIT_PATH = 'yarn-project/boxes';
// for now we just copy the entire noir-libs subpackage, but this should be unnecessary
// when Nargo.toml [requirements] section supports a github URL in addition to relative paths
const NOIR_LIBS_PATH = 'yarn-project/noir-libs';

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
  const snakeCaseContractName = contractNameToFolder(contractName);
  // source noir files for the contract are in this folder
  const contractFolder = `${NOIR_CONTRACTS_PATH}/${snakeCaseContractName}_contract`;
  return await _downloadNoirFilesFromGithub(contractFolder, snakeCaseContractName, outputPath, log);
}

/**
 *
 * @param data - in memory unzipped clone of a github repo
 * @param repositoryFolderPath - folder to copy from github repo
 * @param localOutputPath - local path to copy to
 */
async function _copyFolderFromGithub(data: JSZip, repositoryFolderPath: string, localOutputPath: string, log: LogFn) {
  const repositoryDirectories = Object.values(data.files).filter(file => {
    return file.dir && file.name.startsWith(repositoryFolderPath);
  });

  for (const directory of repositoryDirectories) {
    const relativePath = directory.name.replace(repositoryFolderPath, '');
    const targetPath = `${localOutputPath}/${relativePath}`;
    await fs.mkdir(targetPath, { recursive: true });
  }
  log(
    'copying directories ',
    repositoryDirectories.map(dir => dir.name),
  );

  const starterFiles = Object.values(data.files).filter(file => {
    return !file.dir && file.name.startsWith(repositoryFolderPath);
  });
  // log('copying repository files', starterFiles);

  for (const file of starterFiles) {
    const relativePath = file.name.replace(repositoryFolderPath, '');
    const targetPath = `${localOutputPath}/${relativePath}`;
    const content = await file.async('nodebuffer');
    await fs.writeFile(targetPath, content);
  }
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
async function _downloadNoirFilesFromGithub(
  directoryPath: string,
  snakeCaseContractName: string,
  outputPath: string,
  log: LogFn,
): Promise<void> {
  const owner = GITHUB_OWNER;
  const repo = GITHUB_REPO;
  // Step 1: Fetch the ZIP from GitHub, hardcoded to the master branch
  const url = `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const zip = new JSZip();
  const data = await zip.loadAsync(buffer);

  // Step 2: copy the '@aztec/boxes/{contract-name}' subpackage to the output directory
  // this is currently only implemented for PrivateToken under 'boxes/private-token/'
  const repoDirectoryPrefix = `${repo}-master/`;

  const starterKitPath = `${repoDirectoryPrefix}${STARTER_KIT_PATH}/${snakeCaseContractName}`;
  console.log('downloading from ', starterKitPath);
  await _copyFolderFromGithub(data, starterKitPath, outputPath, log);

  // TEMPORARY FIX - we also need the `noir-libs` subpackage, which needs to be referenced by
  // a relative path in the Nargo.toml file.  Copy those over as well.
  const noirLibsPath = `${repoDirectoryPrefix}${NOIR_LIBS_PATH}/`;
  await _copyFolderFromGithub(data, noirLibsPath, path.join(outputPath, 'src', 'contracts'), log);

  // Step 3: copy the noir contracts to the output directory under subdir /src/contracts/
  const contractDirectoryPath = `${repoDirectoryPrefix}${directoryPath}/`;

  const contractFiles = Object.values(data.files).filter(file => {
    return !file.dir && file.name.startsWith(contractDirectoryPath);
  });

  const contractTargetDirectory = path.join(outputPath, 'src', 'contracts');
  await fs.mkdir(contractTargetDirectory, { recursive: true });
  // Nargo.toml file needs to be in the root of the contracts directory,
  // and noir files in the src/ subdirectory
  await fs.mkdir(path.join(contractTargetDirectory, 'src'), { recursive: true });
  for (const file of contractFiles) {
    const targetPath = path.join(contractTargetDirectory, file.name.replace(contractDirectoryPath, ''));
    log(`Copying ${file.name} to ${targetPath}`);

    const content = await file.async('nodebuffer');
    await fs.writeFile(targetPath, content);
    log(`Copied ${file.name} to ${targetPath}`);
  }
}

/**
 * quick hack to adjust the copied contract Nargo.toml file to point to the location
 * of noir-libs in the newly created/copied starter-kit directory
 * @param outputPath - relative path where we are copying everything
 */
export async function updateNargoToml(outputPath: string, log: LogFn): Promise<void> {
  const nargoTomlPath = path.join(outputPath, 'src', 'contracts', 'Nargo.toml');
  const fileContent = await fs.readFile(nargoTomlPath, 'utf-8');
  const lines = fileContent.split('\n');
  const newLines = lines
    .filter(line => line.startsWith('#'))
    .map(line => {
      // hard coded mapping of dependencies that aztec noir contracts use - add more here to support more "packages"
      if (line.startsWith('aztec')) {
        return `aztec = { path = "./noir-aztec" }`;
      }
      if (line.startsWith('value_note')) {
        return `value_note = { path = "./value-note" }`;
      }
      if (line.startsWith('easy_private_state')) {
        return `easy_private_state = { path = "./easy-private-state" }`;
      }
      return line;
    });
  const updatedContent = newLines.join('\n');
  await fs.writeFile(nargoTomlPath, updatedContent);
  log(`Updated Nargo.toml to point to local copy of noir-libs`);
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

  // Check and replace workspace pins in dependencies
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
