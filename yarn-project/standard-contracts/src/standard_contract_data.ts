// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = ['AuthRegistry'] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  AuthRegistry: new Fr(1),
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromString('0x130fb3e9097456e6d3c486381ec788599d293fd5c0f178bc7e3724c0434faf42'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1bf882a1928c8e72e1e8e0e9595c721d5f5bae6466c24b39da40df04effdb1d7'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x303b31588973316c7544d070c05d148e628eed5a9fcd15c060f6251ea66e55fd'),
    privateFunctionsRoot: Fr.fromString('0x06e0363cea8d971d0c2988a13fc88774092b2858adc5ee0876ed2f9ad05e2f63'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
};

export const StandardContractPrivateFunctions: Record<
  StandardContractName,
  { selector: FunctionSelector; vkHash: Fr }[]
> = {
  AuthRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000079a3d418'),
      ),
      vkHash: Fr.fromString('0x0e6dcc7becc25a6ee2e1322f2cc0ff6b59abff1bce27ca9906c079103e3d2c36'),
    },
  ],
};
