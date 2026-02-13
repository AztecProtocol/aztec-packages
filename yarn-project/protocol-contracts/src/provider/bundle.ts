import type { ContractArtifact } from '@aztec/stdlib/abi';

import { AuthRegistryArtifact } from '../auth-registry/index.js';
import { ContractClassRegistryArtifact } from '../class-registry/index.js';
import { FeeJuiceArtifact } from '../fee-juice/index.js';
import { ContractInstanceRegistryArtifact } from '../instance-registry/index.js';
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';
import type { ProtocolContractName } from '../protocol_contract_data.js';
import type { ProtocolContractsProvider } from './protocol_contracts_provider.js';

export const ProtocolContractArtifact: Record<ProtocolContractName, ContractArtifact> = {
  FeeJuice: FeeJuiceArtifact,
  ContractClassRegistry: ContractClassRegistryArtifact,
  ContractInstanceRegistry: ContractInstanceRegistryArtifact,
  AuthRegistry: AuthRegistryArtifact,
};

export class BundledProtocolContractsProvider implements ProtocolContractsProvider {
  getProtocolContractArtifact(name: ProtocolContractName): Promise<ProtocolContract> {
    return makeProtocolContract(name, ProtocolContractArtifact[name]);
  }
}
