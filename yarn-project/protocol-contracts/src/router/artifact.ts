import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import RouterJson from '../../artifacts/Router.json' assert { type: 'json' };

export const RouterArtifact = loadContractArtifact(RouterJson as NoirCompiledContract);
