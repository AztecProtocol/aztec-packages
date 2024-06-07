import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const artifactPath = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/SchnorrSingleKeyAccount.json');

export const SchnorrSingleKeyAccountContractArtifact = loadContractArtifact(
  JSON.parse(readFileSync(artifactPath, 'utf-8').toString()) as NoirCompiledContract,
);
