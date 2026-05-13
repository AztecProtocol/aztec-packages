// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = ['AuthRegistry', 'PublicChecks'] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  AuthRegistry: new Fr(1),
  PublicChecks: new Fr(1),
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromString('0x035d1c1496ae03e8a2eee7d1b47168faeba4a1555cbc4446352c5ddf953a35b9'),
  PublicChecks: AztecAddress.fromString('0x0ed9aa9b8262bd0afb923764799e058ad10cf0de3e01dcf955055b11fdb20d70'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1bf882a1928c8e72e1e8e0e9595c721d5f5bae6466c24b39da40df04effdb1d7'),
  PublicChecks: Fr.fromString('0x1853dc3b22d13d7fb93a089c366125098bf0f4a169255e12fc3765b3c08c3b6d'),
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
  PublicChecks: {
    artifactHash: Fr.fromString('0x2b11692497c9a3f1f44f4694d1ffb1e521d8cd6ba0e2ef3878026fe9c12fd854'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  PublicChecks: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
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
  PublicChecks: [],
};
