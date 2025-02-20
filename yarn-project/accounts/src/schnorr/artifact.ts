import { loadContractArtifact } from '@aztec/aztec.js';
import type { NoirCompiledContract } from '@aztec/aztec.js';

import SchnorrAccountContractJson from '../../artifacts/SchnorrAccount.json' assert { type: 'json' };

export const SchnorrAccountContractArtifact = loadContractArtifact(SchnorrAccountContractJson as NoirCompiledContract);
