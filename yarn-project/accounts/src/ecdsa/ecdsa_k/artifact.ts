import { loadContractArtifact } from '@aztec/aztec.js';
import type { ContractArtifact, NoirCompiledContract } from '@aztec/aztec.js';

import EcdsaKAccountContractJson from '../../../artifacts/EcdsaKAccount.json' assert { type: 'json' };

export const EcdsaKAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaKAccountContractJson as NoirCompiledContract,
);
