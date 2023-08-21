// heavily inspired by https://github.com/trufflesuite/truffle/blob/develop/packages/box/lib/utils/unbox.ts
import fetch from 'node-fetch';
import JSZip from 'jszip';
import { promises as fs } from 'fs';

const GITHUB_OWNER = 'AztecProtocol';
const GITHUB_REPO = 'aztec-packages';
const NOIR_CONTRACTS_PATH = 'yarn-project/noir-contracts/src/contracts'
const STARTER_KIT_PATH = 'yarn-project/starter-kit'

/**
 * Converts a contract name in "upper camel case" to a folder name in snake case.
 * @param contractName - The contract name.
 * @returns The folder name.
 * */
function contractNameToFolder(contractName: string): string {
    
    return contractName
        .replace(/[\w]([A-Z])/g, (m) => m[0] + "_" + m[1])
        .toLowerCase();
}

/**
 * 
 * @param contractName - The contract name, in upper camel case.
 * @param outputPath - The output path, by default this is the current working directory
 * @returns The path to the downloaded contract.
 */
export async function downloadContractFromGithub(
    contractName: string='PrivateToken',
    outputPath: string
): Promise<void> {
    // small string conversion, in the ABI the contract name looks like PrivateToken
    // but in the repostory it looks like private_token
    const contractFolder = `${NOIR_CONTRACTS_PATH}/${contractNameToFolder(contractName)}_contract`;
    await _downloadNoirFilesFromGithub(contractFolder, outputPath);
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
    outputPath: string,
    outputPrefix: string = 'starter-kit'
): Promise<string> {
    const owner = GITHUB_OWNER;
    const repo = GITHUB_REPO;
    // Step 1: Fetch the ZIP from GitHub, hardcoded to the master branch
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Step 2: Use JSZip to read the ZIP contents
    const zip = new JSZip();
    const data = await zip.loadAsync(buffer);

    // Step 3: Extract the specific directory from the ZIP
    const repoDirectoryPrefix = `${repo}-master/`;
    const fullDirectoryPath = `${repoDirectoryPrefix}${directoryPath}/`;
    const starterKitPath = `${repoDirectoryPrefix}${STARTER_KIT_PATH}/`;

    const contractFiles = Object.values(data.files).filter(file => {
        return file.dir && (file.name.startsWith(fullDirectoryPath) || file.name.startsWith(starterKitPath));
    });
    
    for (const file of contractFiles) {
        // note that we strip out the entire "directoryPath"!
        const relativePath = file.name.replace(fullDirectoryPath, `${outputPrefix}/noir-contracts/`).replace(starterKitPath, `${outputPrefix}/`);
        const targetPath = `${outputPath}/${relativePath}`;
        await fs.mkdir(targetPath, { recursive: true });
    }

    const directoryFiles = Object.values(data.files).filter(file => {
        return !file.dir && (file.name.startsWith(fullDirectoryPath) || file.name.startsWith(starterKitPath));
    });

    for (const file of directoryFiles) {
        const relativePath = file.name.replace(fullDirectoryPath, `${outputPrefix}/noir-contracts/`).replace(starterKitPath, `${outputPrefix}/`);
        const targetPath = `${outputPath}/${relativePath}`;
        const content = await file.async("nodebuffer");
        await fs.writeFile(targetPath, content);
    }
    return Promise.resolve(`${outputPath}/${outputPrefix}`);
}
