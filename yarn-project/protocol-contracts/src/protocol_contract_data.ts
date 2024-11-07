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
  AuthRegistry: Fr.fromString('0x0931f3bf89563f3898ae9650851083cd560ad800c2e3c561c3853eec4dd7ea8b'),
  ContractInstanceDeployer: Fr.fromString('0x266ea4c9917455daa905c1dd1a10753714c6d0369b6f2fe23feeca6de556d164'),
  ContractClassRegisterer: Fr.fromString('0x1ccb7a219f72a851089e956d527997b01068d5a28c9ae96b35ebeb45f068af23'),
  MultiCallEntrypoint: Fr.fromString('0x1d060217817cf472a579638db722903fd1bbc4c3bdb0ecefa5694c0d4eed851a'),
  FeeJuice: Fr.fromString('0x1dab5b687d0c04d2f17a1c8623dea23e7416700891ba1c6e0e86ef678f4727cb'),
  Router: Fr.fromString('0x00827d5a8aedb9627d9e5de04735600a4dbb817d4a2f51281aab991699f5de99'),
};

export const protocolContractTreeRoot = Fr.fromString(
  '0x0f174f6837842b1004a9a41dd736800c12c5dc19f206aed35551b07f8ca6edfb',
);
