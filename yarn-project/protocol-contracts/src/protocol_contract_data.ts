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
  AuthRegistry: Fr.fromString('0x295f52c40413b660d817ceea60d07154322a035d28d18927b2ca84e8ec3b2115'),
  ContractInstanceDeployer: Fr.fromString('0x00113ad28d270a493266484d733f73a56b98c74b4e2cdf9fc040b5d3a6560f2d'),
  ContractClassRegisterer: Fr.fromString('0x1d591819cccc4031cc18a7865321c54f6344ae42a205782874d1f72648df2034'),
  MultiCallEntrypoint: Fr.fromString('0x2b8848426e8142d658de233943cf5092d5a265bb69be51760e26827b806558a5'),
  FeeJuice: Fr.fromString('0x2ed38c200a958d2364c9a8c6f7475cb53e75f602bb7a873b81668c5e431baeb7'),
  Router: Fr.fromString('0x22ec69dd15cc4f9d7272fa362aa86212797ff2c73f33975f78f9d0289322d401'),
};

export const protocolContractTreeRoot = Fr.fromString(
  '0x076133fdf0e7944b748650bbc5f5d154ddbe6b97fa93219f09e42c7d00b03532',
);
