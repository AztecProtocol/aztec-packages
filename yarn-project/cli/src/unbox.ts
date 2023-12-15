// inspired by https://github.com/trufflesuite/truffle/blob/develop/packages/box/lib/utils/unbox.ts
// however, their boxes are stored as standalone git repositories, while ours are subpackages in a monorepo
// so we do some hacky conversions post copy to make them work as standalone packages.
// We download the master branch of the monorepo, and then
// (1) copy "boxes/{CONTRACT_NAME}" subpackage to the specified output directory
// (2) if the box doesnt include noir source code, we copy it from the "noir-contracts" subpackage to into a new subdirectory "X/src/contracts",
// These are used by a simple frontend to interact with the contract and deploy to a local sandbox instance of aztec3.
// The unbox logic can be tested locally by running `$ts-node --esm src/bin/index.ts unbox PrivateToken`
// from `yarn-project/cli/`
import { LogFn } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import * as path from 'path';

import { GITHUB_OWNER, GITHUB_REPO, GITHUB_TAG_PREFIX } from './github.js';

const BOXES_PATH = 'boxes';

/**
 * If the box contains the noir contract source code, we don't need to download it from github.
 * Otherwise, we download the contract source code from the `noir-contracts` and `noir-libs` subpackages.
 */
async function isDirectoryNonEmpty(directoryPath: string): Promise<boolean> {
  try {
    const files = await fs.readdir(directoryPath);
    return files.length > 0;
  } catch (e) {
    // Directory does not exist.
    return false;
  }
}

/**
 *
 * @param data - in memory unzipped clone of a github repo
 * @param repositoryFolderPath - folder to copy from github repo
 * @param localOutputPath - local path to copy to
 */
async function copyFolderFromGithub(data: JSZip, repositoryFolderPath: string, localOutputPath: string, log: LogFn) {
  log(`Downloading folder from github: ${repositoryFolderPath}`);
  const repositoryDirectories = Object.values(data.files).filter(file => {
    return file.dir && file.name.startsWith(repositoryFolderPath);
  });

  for (const directory of repositoryDirectories) {
    const relativePath = directory.name.replace(repositoryFolderPath, '');
    const targetPath = `${localOutputPath}/${relativePath}`;
    await fs.mkdir(targetPath, { recursive: true });
  }

  const folderFiles = Object.values(data.files).filter(file => {
    return !file.dir && file.name.startsWith(repositoryFolderPath);
  });

  for (const file of folderFiles) {
    const relativePath = file.name.replace(repositoryFolderPath, '');
    const targetPath = `${localOutputPath}/${relativePath}`;
    const content = await file.async('nodebuffer');
    await fs.writeFile(targetPath, content);
  }
}

/**
 * @param data - in memory unzipped clone of a github repo
 * @param repositoryFile - path of the file to copy from github repo
 * @param localOutputPath - local path to copy the file to
 */
async function copyFileFromGithub(data: JSZip, repositoryFile: string, localOutputPath: string, log: LogFn) {
  log(`Downloading file from github: ${repositoryFile}`);

  const file = data.files[repositoryFile];

  if (!file || file.dir) {
    throw new Error(`File not found or it's a directory: ${repositoryFile}`);
  }

  const filename = path.basename(repositoryFile);
  const targetPath = `${localOutputPath}/${filename}`;

  const content = await file.async('nodebuffer');
  await fs.writeFile(targetPath, content);
}

/**
 * Not flexible at at all, but quick fix to download a noir smart contract from our
 * monorepo on github.  this will copy over the `yarn-projects/boxes/{contract_name}` folder
 * as well as the specified `directoryPath` if the box doesn't include source code
 * `directoryPath` should point to a single noir contract in `yarn-projects/noir-contracts/src/contracts/...`
 * @param tag - The git tag to pull.
 * @param directoryPath - path to a noir contract's source code (folder) in the github repo
 * @param outputPath - local path that we will copy the noir contracts and web3 starter kit to
 * @returns
 */
async function downloadContractAndBoxFromGithub(
  tag: string,
  contractName: string,
  outputPath: string,
  log: LogFn,
): Promise<void> {
  // small string conversion, in the ABI the contract name looks like PrivateToken
  // but in the repository it looks like private_token

  log(`Downloading @aztec-protocol/boxes/${contractName}/ to ${outputPath}...`);
  // Step 1: Fetch the monorepo ZIP from GitHub, matching the CLI version
  const url = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${tag}.zip`;
  log(`Downloading from ${url}`);
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const zip = new JSZip();
  const data = await zip.loadAsync(buffer);

  // Step 2: copy the '@aztec/boxes/{contract-name}' subpackage to the output directory
  // this is currently only implemented for `blank`, `blank-react` and `token` under 'boxes/{box-name}/'
  const repoDirectoryPrefix = `${GITHUB_REPO}-${tag}`;

  const boxPath = `${repoDirectoryPrefix}/${BOXES_PATH}/${contractName}/`;
  await copyFolderFromGithub(data, boxPath, outputPath, log);

  // the expected noir version is contained in
  // aztec-packages/yarn-project/noir-compiler/src/noir-version.json
  // copy it in and use to update the package.json script to install that version of noir
  const noirVersionPath = `${repoDirectoryPrefix}/yarn-project/noir-compiler/src/noir-version.json`;
  await copyFileFromGithub(data, noirVersionPath, outputPath, log);

  const contractTargetDirectory = path.join(outputPath, 'src', 'contracts');
  const boxContainsNoirSource = await isDirectoryNonEmpty(contractTargetDirectory);
  if (boxContainsNoirSource) {
    return;
  } else {
    // we used to support downloading from the noir contracts monorepo but now force box to contain source code
    // This should never happen, because of the check we do initially on the box name.
    throw Error(`Box ${contractName} does not contain noir source code.`);
  }
}
/**
 * Does some conversion from the package/build configurations in the monorepo to the
 * something usable by the copied standalone unboxed folder.  Adjusts relative paths
 * and package versions.
 * @param packageVersion - CLI npm version, which determines what npm version to grab
 * @param tag - The git tag.
 * @param outputPath - relative path where we are copying everything
 * @param log - logger
 */
async function updatePackagingConfigurations(
  packageVersion: string,
  tag: string,
  outputPath: string,
  log: LogFn,
): Promise<void> {
  await updatePackageJsonVersions(packageVersion, outputPath, log);
  await updateTsConfig('tsconfig.json', outputPath, log);
  await updateTsConfig('tsconfig.dest.json', outputPath, log);
  await updateNargoToml(tag, outputPath, log);
}

/**
 * Adjust the contract Nargo.toml file for copied box:
 * change the dependency paths from pointing within the monorepo
 * to the github tagged version matching the installed `aztec-cli --version`
 * @param packageVersion - CLI npm version, which determines what npm version to grab
 * @param outputPath - relative path where we are copying everything
 * @param log - logger
 */
async function updateNargoToml(tag: string, outputPath: string, log: LogFn): Promise<void> {
  const SUPPORTED_DEPS = ['aztec', 'value_note', 'safe_math', 'authwit'];

  const nargoTomlPath = path.join(outputPath, 'src', 'contracts', 'Nargo.toml');
  const fileContent = await fs.readFile(nargoTomlPath, 'utf-8');
  const lines = fileContent.split('\n');
  const updatedLines = lines.map(line => {
    // Check if the line starts with one of the deps
    const key: string | undefined = SUPPORTED_DEPS.find(dependencyName =>
      line.trim().startsWith(`${dependencyName} =`),
    );
    if (key) {
      // Replace the line, which was configured for compiling within the `aztec-packages` monorepo.  We replace
      // the local path with `git` and `directory` fields with a `tag` field, which points to the tagged release
      // note that the key has a "_" in the name, but we use "-" in the github repo folder
      return `${key} = { git="https://github.com/AztecProtocol/aztec-packages/", tag="${tag}", directory="yarn-project/aztec-nr/${key.replace(
        '_',
        '-',
      )}" }`;
    }
    return line;
  });
  const updatedContent = updatedLines.join('\n');
  await fs.writeFile(nargoTomlPath, updatedContent);
  log(`Updated Nargo.toml to point to version ${tag} of aztec-noir libs in github.`);
}

/**
 * The `tsconfig.json` also needs to be updated to remove the "references" section, which
 * points to the monorepo's subpackages.  Those are unavailable in the cloned subpackage,
 * so we remove the entries to install the the workspace packages from npm.
 * @param outputPath - directory we are unboxing to
 */
async function updateTsConfig(filename: string, outputPath: string, log: LogFn) {
  try {
    const tsconfigJsonPath = path.join(outputPath, filename);
    const data = await fs.readFile(tsconfigJsonPath, 'utf8');
    const config = JSON.parse(data);

    delete config.references;

    const updatedData = JSON.stringify(config, null, 2);
    await fs.writeFile(tsconfigJsonPath, updatedData, 'utf8');

    log(`Updated ${filename}.`);
  } catch (error) {
    log(`Error updating ${filename}.`);
    throw error;
  }
}

/**
 * We pin to "workspace:^" in the package.json for subpackages, but we need to replace it with
 * an the actual version number in the cloned starter kit
 * We modify the copied package.json and pin to the version of the package that was downloaded
 * @param packageVersion - CLI npm version, which determines what npm version to grab
 * @param outputPath - directory we are unboxing to
 * @param log - logger
 */
async function updatePackageJsonVersions(packageVersion: string, outputPath: string, log: LogFn): Promise<void> {
  const packageJsonPath = path.join(outputPath, 'package.json');
  const fileContent = await fs.readFile(packageJsonPath, 'utf-8');
  const packageData = JSON.parse(fileContent);

  // Check and replace "workspace^" pins in dependencies, which are monorepo yarn workspace references
  if (packageData.dependencies) {
    for (const [key, value] of Object.entries(packageData.dependencies)) {
      const packageVersion: string = value as string;
      if (packageVersion.startsWith('portal:')) {
        // portal: dependency used in monorepo when we moved boxes out of the workspace
        packageData.dependencies[key] = `^${packageVersion}`;
      }
    }
  }

  // Check and replace in devDependencies
  if (packageData.devDependencies) {
    for (const [key, value] of Object.entries(packageData.devDependencies)) {
      if (value === 'workspace:^') {
        // TODO: check if this right post landing.  the package.json version looks like 0.1.0
        // but the npm versions look like v0.1.0-alpha63 so we are not fully pinned
        packageData.devDependencies[key] = `^${packageVersion}`;
      }
    }
  }

  // now that boxes are out of the workspace, remove the "resolution" hint in the package.json that is used
  // to resolve the transitive workspace dependencies in the monorepo
  if (packageData.resolutions) {
    delete packageData.resolutions;
  }

  // read the `noir-version.json`, grab the expected noir version, and patch the noir install script
  const noirVersionPath = path.join(outputPath, 'noir-version.json');
  const noirVersionContent = await fs.readFile(noirVersionPath, 'utf-8');
  const noirVersionJSON = JSON.parse(noirVersionContent);
  const noirTag = noirVersionJSON.tag;
  packageData.scripts['install:noir'] = packageData.scripts['install:noir'].replace('NOIR_VERSION', `${noirTag}`);
  log(`Updated Noir version to: ${noirTag}`);

  // modify the version of the sandbox to pull - it's set to "latest" version in the monorepo,
  // but we need to replace with the same tagVersion as the cli and the other aztec npm packages
  // similarly, make sure we spin up the sandbox with the same version.
  packageData.scripts['install:sandbox'] = packageData.scripts['install:sandbox'].replace(
    'latest',
    `${packageVersion}`,
  );

  packageData.scripts['start:sandbox'] = packageData.scripts['start:sandbox'].replace('latest', `${packageVersion}`);

  // Convert back to a string and write back to the package.json file
  const updatedContent = JSON.stringify(packageData, null, 2);
  await fs.writeFile(packageJsonPath, updatedContent);

  log(`Updated package.json versions to: ${packageVersion}`);
}

/**
 *
 * @param outputDirectoryName - user specified directory we are "unboxing" files into
 * @param log - logger
 * @returns
 */
async function createDirectory(outputDirectoryName: string, log: LogFn): Promise<string> {
  const absolutePath = path.resolve(outputDirectoryName);

  try {
    // Checking if the path exists and if it is a directory
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`The specified path ${outputDirectoryName} is not a directory/folder.`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(absolutePath, { recursive: true });
      log(`The directory did not exist and has been created: ${absolutePath}`);
    } else {
      throw error;
    }
  }

  return absolutePath;
}

/**
 * Unboxes a contract from `@aztec/boxes` by performing the following operations:
 * 1. Copies the frontend template from `@aztec/boxes/{contract_name}` to the outputDirectory
 * 2. Checks if the contract source was copied over from `@aztec/boxes/{contract_name}/src/contracts`
 * 3. If not, copies the contract from the appropriate `@aztec/noir-contracts/src/contracts/...` folder.
 *
 * The box provides a simple React app which parses the contract ABI
 * and generates a UI to deploy + interact with the contract on a local aztec testnet.
 * @param contractName - name of contract from `@aztec/noir-contracts`, in a format like "PrivateToken" (rather than "private_token", as it appears in the noir-contracts repo)
 * @param log - Logger instance that will output to the CLI
 */
export async function unboxContract(
  contractName: string,
  outputDirectoryName: string,
  packageVersion: string,
  log: LogFn,
) {
  const contractNames = ['token', 'blank', 'blank-react'];

  if (!contractNames.includes(contractName)) {
    log(
      `The noir contract named "${contractName}" was not found in "aztec-packages/boxes" directory.  Valid options are:
        ${contractNames.join('\n\t')}
      We recommend "token" as a default.`,
    );
    return;
  }
  const outputPath = await createDirectory(outputDirectoryName, log);

  const tag = `${GITHUB_TAG_PREFIX}-v${packageVersion}`;
  // downloads the selected contract's relevant folder in @aztec/boxes/{contract_name}
  await downloadContractAndBoxFromGithub(tag, contractName, outputPath, log);
  // make adjustments for packaging to work as a standalone, as opposed to part of yarn workspace
  // as in the monorepo source files.  replace things like "workspace^" with the actual version number
  await updatePackagingConfigurations(packageVersion, tag, outputPath, log);

  log('');
  log(`${contractName} has been successfully initialized!`);
  log('To get started, simply run the following commands:');
  log(`    cd ${outputDirectoryName}`);
  log('    yarn');
  log('    yarn start:sandbox');
  log('And in another terminal in the same directory,');
  log('    yarn start:dev');
}
