import { fileURLToPath } from '@aztec/foundation/url';
import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const artifactPath = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/ContractClassRegisterer.json');

export const ContractClassRegistererArtifact = loadContractArtifact(
  JSON.parse(readFileSync(artifactPath, 'utf-8').toString()) as NoirCompiledContract,
);
