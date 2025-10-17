/* eslint-disable no-console */
import { loadContractArtifact } from '@aztec/stdlib/abi';

import crypto from 'crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import path from 'path';

import { generateTypescriptContractInterface } from './typescript.js';

const cacheFilePath = './codegenCache.json';
let cache: Record<string, { contractName: string; hash: string }> = {};

/**
 * Options for code generation.
 *
 * @property force - If true, forces code generation even when the contract artifact hasn't changed.
 *                   Useful for regenerating code after template changes.
 */
export type GenerateCodeOptions = { force?: boolean };

/**
 * Generates TypeScript contract interfaces from Noir compilation artifacts.
 *
 * @remarks
 * This is the primary codegen function that creates type-safe TypeScript wrappers for Noir contracts.
 * It processes either a single JSON artifact file or an entire directory of artifacts, generating
 * corresponding .ts files with:
 * - Type-safe method signatures for all contract functions
 * - Deploy methods for contract deployment
 * - Static methods for connecting to existing contracts
 * - Type definitions for contract events and structs
 *
 * The function uses file hashing to detect changes and avoid unnecessary regeneration unless
 * the `force` option is set.
 *
 * Generated files follow this pattern:
 * - Input: `ContractName.json` (Noir compilation artifact)
 * - Output: `ContractName.ts` (TypeScript wrapper class)
 *
 * @param outputPath - Directory where the generated TypeScript files will be written
 * @param fileOrDirPath - Path to a single .json artifact file or directory containing artifacts
 * @param opts - Optional configuration for code generation
 * @returns Array of paths to the generated TypeScript files
 *
 * @example
 * ```typescript
 * // Generate types for a single contract
 * await generateCode('./src', './artifacts/TokenContract.json');
 *
 * // Generate types for all contracts in a directory
 * await generateCode('./src', './artifacts', { force: true });
 * ```
 */
export async function generateCode(outputPath: string, fileOrDirPath: string, opts: GenerateCodeOptions = {}) {
  await readCache();
  const results = [];
  const stats = await stat(fileOrDirPath);

  if (stats.isDirectory()) {
    const files = (await readdir(fileOrDirPath, { recursive: true, encoding: 'utf-8' })).filter(
      file => file.endsWith('.json') && !file.startsWith('debug_'),
    );
    for (const file of files) {
      const fullPath = path.join(fileOrDirPath, file);
      results.push(await generateFromNoirAbi(outputPath, fullPath, opts));
    }
  } else if (stats.isFile()) {
    results.push(await generateFromNoirAbi(outputPath, fileOrDirPath, opts));
  }
  await writeCache();
  return results;
}

/**
 * Generates a TypeScript interface file from a single Noir compilation artifact.
 *
 * @remarks
 * This internal function handles the actual code generation for a single contract artifact.
 * It performs the following steps:
 * 1. Checks if the artifact has changed using SHA-256 hashing
 * 2. Loads and parses the Noir compilation artifact JSON
 * 3. Converts the artifact to Aztec's contract format
 * 4. Generates TypeScript wrapper code with type-safe methods
 * 5. Writes the output file and updates the cache
 *
 * The cache mechanism prevents unnecessary regeneration when artifacts haven't changed,
 * significantly speeding up iterative development.
 *
 * @param outputPath - Directory where the TypeScript file will be written
 * @param noirAbiPath - Path to the Noir compilation artifact (.json file)
 * @param opts - Optional configuration for code generation
 * @returns Path to the generated TypeScript file
 *
 * @internal
 */
async function generateFromNoirAbi(outputPath: string, noirAbiPath: string, opts: GenerateCodeOptions = {}) {
  const fileName = path.basename(noirAbiPath);
  const currentHash = await generateFileHash(noirAbiPath);
  const cachedInstance = isCacheValid(fileName, currentHash);
  if (cachedInstance && !opts.force) {
    console.log(`${fileName} has not changed. Skipping generation.`);
    return `${outputPath}/${cachedInstance.contractName}.ts`;
  }

  const file = await readFile(noirAbiPath, 'utf8');
  const contract = JSON.parse(file);
  const aztecAbi = loadContractArtifact(contract);

  await mkdir(outputPath, { recursive: true });

  let relativeArtifactPath = path.relative(outputPath, noirAbiPath);
  if (relativeArtifactPath === path.basename(noirAbiPath)) {
    // Prepend ./ for local import if the folder is the same
    relativeArtifactPath = `./${relativeArtifactPath}`;
  }

  const tsWrapper = await generateTypescriptContractInterface(aztecAbi, relativeArtifactPath);
  const outputFilePath = `${outputPath}/${aztecAbi.name}.ts`;

  await writeFile(outputFilePath, tsWrapper);

  updateCache(fileName, aztecAbi.name, currentHash);
  return outputFilePath;
}

/**
 * Generates a SHA-256 hash of a file for change detection.
 *
 * @param filePath - Path to the file to hash
 * @returns Hexadecimal string representation of the file's SHA-256 hash
 * @internal
 */
async function generateFileHash(filePath: string) {
  const fileBuffer = await readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  return hex;
}

/**
 * Reads the codegen cache from disk if it exists.
 *
 * @remarks
 * The cache stores file hashes and contract names to avoid regenerating
 * TypeScript interfaces when the source artifacts haven't changed.
 *
 * @internal
 */
async function readCache() {
  if (await exists(cacheFilePath)) {
    const cacheRaw = await readFile(cacheFilePath, 'utf8');
    cache = JSON.parse(cacheRaw);
  }
}

/**
 * Writes the current cache state to disk.
 *
 * @remarks
 * Persists the cache as JSON to avoid unnecessary regeneration in future runs.
 *
 * @internal
 */
async function writeCache() {
  await writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Checks if a cached entry is still valid for a given contract.
 *
 * @param contractName - Name of the contract to check
 * @param currentHash - Current hash of the contract artifact
 * @returns The cached entry if valid, undefined otherwise
 * @internal
 */
function isCacheValid(contractName: string, currentHash: string) {
  return cache[contractName]?.hash === currentHash && cache[contractName];
}

/**
 * Updates the cache with a new or modified contract entry.
 *
 * @param fileName - Name of the artifact file
 * @param contractName - Name of the contract
 * @param hash - SHA-256 hash of the artifact file
 * @internal
 */
function updateCache(fileName: string, contractName: string, hash: string): void {
  cache[fileName] = { contractName, hash };
}

/**
 * Checks if a file exists at the given path.
 *
 * @param filePath - Path to check for existence
 * @returns True if the file exists, false otherwise
 * @internal
 */
async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
