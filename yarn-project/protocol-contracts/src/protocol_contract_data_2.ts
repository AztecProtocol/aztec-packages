// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const protocolContractNames = [
  'AuthRegistry',
  'ContractInstanceDeployer',
  'ContractClassRegisterer',
  'MultiCallEntrypoint',
  'FeeJuice',
  'Router',
] as const;

export type ProtocolContractName = (typeof protocolContractNames)[number];

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

export const ProtocolContractLeaves = {
  AuthRegistry: Fr.fromHexString('0x0807ac7ed9aae595efff561f39373a321811ed9bb69d9104fe3035b487ade50a'),
  ContractInstanceDeployer: Fr.fromHexString('0x28c3aee0c74e02b17f1ebf7bcd2c2874d4dce88b2ededf487e07d4b1912303ab'),
  ContractClassRegisterer: Fr.fromHexString('0x1f73d3d99860b24a5e8c4e4a6cadbb097370984293495d4c0bbfd809b690c49f'),
  MultiCallEntrypoint: Fr.fromHexString('0x2182bf9eb009655d81599ac098f641ee5095519f5bb4b30658c61807d4a83ae7'),
  FeeJuice: Fr.fromHexString('0x27e36a350de1027f4c9847e9fbe67585aacd2cb4b8d3edde5e33ba73d5d3c686'),
  Router: Fr.fromHexString('0x292db7e4209a217067fa7c1fcd2e8b98bb94a2fe1e564accda7d1b361bbd7c12'),
};

export const protocolContractTreeRoot = Fr.fromHexString(
  '0x0d728eb2ee21a9484e34312160bec66dd5995c80bb6cfb51e86528a7dae92870',
);

export const REGISTERER_CONTRACT_CLASS_REGISTERED_TAG = Fr.fromHexString(
  '0x20cd27645f65c15a38720ca984aef936592f3938a705db706d068ad13fc58ae9',
);
export const REGISTERER_PRIVATE_FUNCTION_BROADCASTED_TAG = Fr.fromHexString(
  '0x0abf338154e355442d9916d630da0491036d5a7b23c42b477c1395ba3bf9b42d',
);
export const REGISTERER_UTILITY_FUNCTION_BROADCASTED_TAG = Fr.fromHexString(
  '0x27774539896271d6dbe0c1de45ddc44709d1e8d9a9fb686ca3c105d87c417bb8',
);
export const DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG = Fr.fromHexString(
  '0x2ec28b91a5f838506d6042915005ff55cf7a0a5f889a83b11faed33a31b486f2',
);
export const DEPLOYER_CONTRACT_INSTANCE_UPDATED_TAG = new Fr(
  1534834688047131268740281708431107902615560100979874281215533519862n,
);
