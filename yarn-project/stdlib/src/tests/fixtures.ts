import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { type ContractArtifact, loadContractArtifact } from '../abi/index.js';
import type { NoirCompiledContract } from '../noir/index.js';

// Copied from the build output for the contract `Benchmarking` in noir-contracts
export function getBenchmarkContractArtifact(): ContractArtifact {
  const path = getPathToFixture('Benchmarking.test.json');
  const content = JSON.parse(readFileSync(path).toString()) as NoirCompiledContract;
  return loadContractArtifact(content);
}

// Copied from the build output for the contract `Test` in noir-contracts
export function getTestContractArtifact(): ContractArtifact {
  const path = getPathToFixture('Test.test.json');
  const content = JSON.parse(readFileSync(path).toString()) as NoirCompiledContract;
  return loadContractArtifact(content);
}

// Copied from the build output for the contract `Token` in noir-contracts
export function getTokenContractArtifact(): ContractArtifact {
  const path = getPathToFixture('Token.test.json');
  const content = JSON.parse(readFileSync(path).toString()) as NoirCompiledContract;
  return loadContractArtifact(content);
}

export function getPathToFixture(name: string) {
  return resolve(dirname(fileURLToPath(import.meta.url)), `../../fixtures/${name}`);
}
