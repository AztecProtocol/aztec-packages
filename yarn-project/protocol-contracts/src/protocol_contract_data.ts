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
  AuthRegistry: Fr.fromString('0x264d5813e33795397db05b027f17c6d16f38289f7e8c7ce3ed27a8428c5ffc47'),
  ContractInstanceDeployer: Fr.fromString('0x0a2d2bebf9ed365ecf2fe61b1da069c93d3c0cc252a3ebd29a7e04c83bc88f52'),
  ContractClassRegisterer: Fr.fromString('0x1f6709a774da0656ece30dcb29f604f13ea39e5bebba158ad4ee3ca55d32ee7d'),
  MultiCallEntrypoint: Fr.fromString('0x1bf3e24391488ef068ffca602ba37aca41533a2e3c73fbea247340f31be05fd7'),
  FeeJuice: Fr.fromString('0x1002548e0fa75e8aad3f6ed92a8e0f3dd99273139341b7c2fe2915ef7f32b571'),
  Router: Fr.fromString('0x0713c42228cc09b0b0a0aaa010cb49d8ba1d9404c299e472693306127b17fac7'),
};

export const protocolContractTreeRoot = Fr.fromString(
  '0x2b9ff3b378c200af8b4bda92b6d0c5aebd3fe7d8b3d1265a412b9548e98559c7',
);
