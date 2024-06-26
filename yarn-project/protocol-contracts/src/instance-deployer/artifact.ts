import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import ContractInstanceDeployerJson from '../../artifacts/ContractInstanceDeployer.json' assert { type: 'json' };

export const ContractInstanceDeployerArtifact = loadContractArtifact(
  ContractInstanceDeployerJson as NoirCompiledContract,
);
