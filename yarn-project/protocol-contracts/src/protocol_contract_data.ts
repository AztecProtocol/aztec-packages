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

export type ProtocolContractName =
  | 'AuthRegistry'
  | 'ContractInstanceDeployer'
  | 'ContractClassRegisterer'
  | 'MultiCallEntrypoint'
  | 'FeeJuice'
  | 'Router';

export const protocolContractNames: ProtocolContractName[] = [
  'AuthRegistry',
  'ContractInstanceDeployer',
  'ContractClassRegisterer',
  'MultiCallEntrypoint',
  'FeeJuice',
  'Router',
];

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
  AuthRegistry: Fr.fromString('0x2ace300b02ca5ab0a25052b1e852913a47292096997ca09f758c0e3624e84560'),
  ContractInstanceDeployer: Fr.fromString('0x25d93dc07b5baaf53a98caeae2679df3528cb83e11e2640a57a0a53abbaaadb9'),
  ContractClassRegisterer: Fr.fromString('0x1b6d5873cef5a35f681ab9468527f356c96e09b3c64603aef404ec2ad80aa3a9'),
  MultiCallEntrypoint: Fr.fromString('0x0966ead8d11933bb3c72547bb997898971715f2275acd4c7d5d86fdf614ba1a2'),
  FeeJuice: Fr.fromString('0x1abe6c7f5c4caf04cbf7556495e08ad9c0a225a5f9d33554ae07285b13c494d7'),
  Router: Fr.fromString('0x1d8f25db3e8faa6a96cb1ecf57876a2ee04581deb3c4f181488ccd817abcbdb0'),
};

export const protocolContractTreeRoot = Fr.fromString(
  '0x06f99dec43b75bcf6cb51c725a2b60bd96095ca04c672f7018f744c73c07b09d',
);
