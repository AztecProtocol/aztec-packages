import { type NoirCompiledContract, loadContractArtifact } from '@aztec/aztec.js';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const artifactPath = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/SchnorrSingleKeyAccount.json');

export const SchnorrSingleKeyAccountContractArtifact = loadContractArtifact(
  JSON.parse(readFileSync(artifactPath, 'utf-8').toString()) as NoirCompiledContract,
);
