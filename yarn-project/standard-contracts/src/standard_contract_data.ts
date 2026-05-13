// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = ['AuthRegistry', 'MultiCallEntrypoint', 'PublicChecks'] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  AuthRegistry: new Fr(1),
  MultiCallEntrypoint: new Fr(1),
  PublicChecks: new Fr(1),
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromString('0x035d1c1496ae03e8a2eee7d1b47168faeba4a1555cbc4446352c5ddf953a35b9'),
  MultiCallEntrypoint: AztecAddress.fromString('0x1e614f211eaa30a123fe91f50a3ad6333846b0d7f389198ae9a5414f28c37bb0'),
  PublicChecks: AztecAddress.fromString('0x0ed9aa9b8262bd0afb923764799e058ad10cf0de3e01dcf955055b11fdb20d70'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1bf882a1928c8e72e1e8e0e9595c721d5f5bae6466c24b39da40df04effdb1d7'),
  MultiCallEntrypoint: Fr.fromString('0x124e40a58bff73a71ff76248d089540874cff6cc533af61a2abba8ad38c13e53'),
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
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x111a5c01d590689e44fe17f639135cc1636393df6abadbaa832ceb02e6b17f4f'),
    privateFunctionsRoot: Fr.fromString('0x1497e05e2f823193577378ed04f91211331c657f7794113716315f52beff0a6a'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2b11692497c9a3f1f44f4694d1ffb1e521d8cd6ba0e2ef3878026fe9c12fd854'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  MultiCallEntrypoint: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
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
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x06d65a5559a8f078b79b10786980ba9b3b11516210124599f1eb26edbd315d0a'),
    },
  ],
  PublicChecks: [],
};
