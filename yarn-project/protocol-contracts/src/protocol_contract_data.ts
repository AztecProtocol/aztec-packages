// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { AztecAddress, Fr } from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import AuthRegistryJson from '../artifacts/AuthRegistry.json' assert { type: 'json' };
import ContractClassRegistererJson from '../artifacts/ContractClassRegisterer.json' assert { type: 'json' };
import ContractInstanceDeployerJson from '../artifacts/ContractInstanceDeployer.json' assert { type: 'json' };
import FeeJuiceJson from '../artifacts/FeeJuice.json' assert { type: 'json' };
import MultiCallEntrypointJson from '../artifacts/MultiCallEntrypoint.json' assert { type: 'json' };
import RouterJson from '../artifacts/Router.json' assert { type: 'json' };

export const protocolContractNames = [
  'AuthRegistry',
  'ContractInstanceDeployer',
  'ContractClassRegisterer',
  'MultiCallEntrypoint',
  'FeeJuice',
  'Router',
] as const;

export type ProtocolContractName = (typeof protocolContractNames)[number];

export const ProtocolContractArtifact: Record<ProtocolContractName, ContractArtifact> = {
  AuthRegistry: loadContractArtifact(AuthRegistryJson as NoirCompiledContract),
  ContractInstanceDeployer: loadContractArtifact(ContractInstanceDeployerJson as NoirCompiledContract),
  ContractClassRegisterer: loadContractArtifact(ContractClassRegistererJson as NoirCompiledContract),
  MultiCallEntrypoint: loadContractArtifact(MultiCallEntrypointJson as NoirCompiledContract),
  FeeJuice: loadContractArtifact(FeeJuiceJson as NoirCompiledContract),
  Router: loadContractArtifact(RouterJson as NoirCompiledContract),
};

export const ProtocolContractSalt: Record<ProtocolContractName, Fr> = {
  AuthRegistry: new Fr(1),
  ContractInstanceDeployer: new Fr(1),
  ContractClassRegisterer: new Fr(1),
  MultiCallEntrypoint: new Fr(1),
  FeeJuice: new Fr(1),
  Router: new Fr(1),
};

export const ProtocolContractAddress: Record<ProtocolContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromBigInt(1n),
  ContractInstanceDeployer: AztecAddress.fromBigInt(2n),
  ContractClassRegisterer: AztecAddress.fromBigInt(3n),
  MultiCallEntrypoint: AztecAddress.fromBigInt(4n),
  FeeJuice: AztecAddress.fromBigInt(5n),
  Router: AztecAddress.fromBigInt(6n),
};

export const ProtocolContractLeaf = {
  AuthRegistry: Fr.fromString('0x28a7d6b69b161a277995403f70e5ed4d4bb27fccfe06277f0ce260f0c34665b9'),
  ContractInstanceDeployer: Fr.fromString('0x04a661c9d4d295fc485a7e0f3de40c09b35366343bce8ad229106a8ef4076fe5'),
  ContractClassRegisterer: Fr.fromString('0x147ba3294403576dbad10f86d3ffd4eb83fb230ffbcd5c8b153dd02942d0611f'),
  MultiCallEntrypoint: Fr.fromString('0x154b701b41d6cf6da7204fef36b2ee9578b449d21b3792a9287bf45eba48fd26'),
  FeeJuice: Fr.fromString('0x094caa4d1259aa99ea4a8a97a9fa8cbae29ecc8ed818b0f0516cf9fd753b97e6'),
  Router: Fr.fromString('0x215265750d313695cc669740b19f926207cdcf2c8ee69a8504921b361b0dda08'),
};

export const protocolContractTreeRoot = Fr.fromString(
  '0x034740a11a8535c69a6e99b1ca126667c5eb1ea9c7f537d96bc9e51c67b18cfa',
);
