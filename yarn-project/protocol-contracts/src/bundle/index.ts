import { type ContractArtifact } from '@aztec/circuits.js/abi';
import { getContractClassFromArtifact, getContractInstanceFromDeployParams } from '@aztec/circuits.js/contract';

import { AuthRegistryArtifact } from '../auth-registry/index.js';
import { ContractClassRegistererArtifact } from '../class-registerer/index.js';
import { FeeJuiceArtifact } from '../fee-juice/index.js';
import { ContractInstanceDeployerArtifact } from '../instance-deployer/index.js';
import { MultiCallEntrypointArtifact } from '../multi-call-entrypoint/index.js';
import { type ProtocolContract } from '../protocol_contract.js';
import { ProtocolContractAddress, type ProtocolContractName, ProtocolContractSalt } from '../protocol_contract_data.js';
import { RouterArtifact } from '../router/index.js';

/** Returns the canonical deployment a given artifact. */
export async function getCanonicalProtocolContract(name: ProtocolContractName): Promise<ProtocolContract> {
  const artifact = ProtocolContractArtifact[name];
  const address = ProtocolContractAddress[name];
  const salt = ProtocolContractSalt[name];
  // TODO(@spalladino): This computes the contract class from the artifact twice.
  const contractClass = await getContractClassFromArtifact(artifact);
  const instance = await getContractInstanceFromDeployParams(artifact, { salt });
  return {
    instance: { ...instance, address },
    contractClass,
    artifact,
    address,
  };
}

export const ProtocolContractArtifact: Record<ProtocolContractName, ContractArtifact> = {
  AuthRegistry: AuthRegistryArtifact,
  ContractInstanceDeployer: ContractInstanceDeployerArtifact,
  ContractClassRegisterer: ContractClassRegistererArtifact,
  MultiCallEntrypoint: MultiCallEntrypointArtifact,
  FeeJuice: FeeJuiceArtifact,
  Router: RouterArtifact,
};
