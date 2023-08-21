// heavily inspired by https://github.com/trufflesuite/truffle/blob/develop/packages/box/lib/utils/unbox.ts
import fetch from 'node-fetch';
import JSZip from 'jszip';
import { promises as fs } from 'fs';

const GITHUB_OWNER = 'AztecProtocol';
const GITHUB_REPO = 'aztec-packages';
const NOIR_CONTRACTS_PATH = 'yarn-project/noir-contracts/src/contracts'
const STARTER_KIT_PATH = 'yarn-project/starter-kit/'

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
    const folder = `${NOIR_CONTRACTS_PATH}/${contractNameToFolder(contractName)}_contract`;
    console.log(folder);
    await _downloadDirectoryFromGithub(GITHUB_OWNER, GITHUB_REPO, folder, outputPath);
}   

async function _downloadDirectoryFromGithub(
    owner: string,
    repo: string,
    directoryPath: string,
    outputPath: string
): Promise<string> {
    // Step 1: Fetch the ZIP from GitHub
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
    console.log(url);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    console.log(buffer);

    // Step 2: Use JSZip to read the ZIP contents
    const zip = new JSZip();
    const data = await zip.loadAsync(buffer);

    // Step 3: Extract the specific directory from the ZIP
    const repoDirectoryPrefix = `${repo}-master/`;
    const fullDirectoryPath = `${repoDirectoryPrefix}${directoryPath}/`;
    //console.log(Object.values(data.files));
    console.log(fullDirectoryPath);

    const contractFiles = Object.values(data.files).filter(file => {
        return file.dir && file.name.startsWith(fullDirectoryPath);
    });
    
    console.log(contractFiles);

    for (const file of contractFiles) {
        // note that we strip out the entire "directoryPath"!
        const relativePath = file.name.replace(fullDirectoryPath, "starter-kit/noir-contracts/");
        const targetPath = `${outputPath}/${relativePath}`;
        await fs.mkdir(targetPath, { recursive: true });
        console.log('made dir', targetPath);
    }

    const directoryFiles = Object.values(data.files).filter(file => {
        return !file.dir && file.name.startsWith(fullDirectoryPath);
    });

    for (const file of directoryFiles) {
        const relativePath = file.name.replace(fullDirectoryPath, "starter-kit/noir-contracts/");
        const targetPath = `${outputPath}/${relativePath}`;
        const content = await file.async("nodebuffer");
        await fs.writeFile(targetPath, content);
        console.log('wrote file', targetPath);
    }
    return Promise.resolve(`${outputPath}/starter-kit`);
}

// Example usage:
// downloadDirectoryFromGithub('microsoft', 'TypeScript', 'src/compiler', './downloaded').catch(console.error);
