// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = [
  'AuthRegistry',
  'MultiCallEntrypoint',
  'PublicChecks',
  'HandshakeRegistry',
] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  AuthRegistry: new Fr(1),
  MultiCallEntrypoint: new Fr(1),
  PublicChecks: new Fr(1),
  HandshakeRegistry: new Fr(1),
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromStringUnsafe('0x01e73b560c16197b593fabb3d352323c82fa9b4cb815cc7afce74c56563c167d'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x211f139bb4ddabc0227f89ac948bd5f2c2ff4e8d98088f00416f6d42961d20d1',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0ea967da35aaa37ea5688896de054e272b69ab7717ae931d42826b72de62c222'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x20a05e6831aa1dd925708e27e5947858c0929571ad6432a584e44862d8a87cb4',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x01f9dbd1c2c8f40d258cc517d25c462aa4677ec34e5ee364fb945db7583bee76'),
  MultiCallEntrypoint: Fr.fromString('0x16cf1166c44a903f728ca74060ebfa9fbc086aeac917a3d8979ea6e0f0185aaa'),
  PublicChecks: Fr.fromString('0x288bf900a02465ce6b161a9a17e4f0b8da64dd1795e0eb8c95b0278f4709257a'),
  HandshakeRegistry: Fr.fromString('0x24d3754856638bbcd3b7c2366fce4bb01a5b07c8b18109dcf9e10c5dba1dbf06'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0b872a63a67580a4603e04a15e56025a17bebcf0090da524df050e94a195f650'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0812dd98bf0e745739db8429d5fce42fbb5fb795a3e2fbc9223ee622a7b2d7c7'),
    privateFunctionsRoot: Fr.fromString('0x0273da8ebcaf6451905045200646d8dd4f5ea63565e8517815efff11b42b69cd'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x29ed0086c79abcc4d6db11f036998fab26f3e2e544be94c8f3c0e8c42c9ce70f'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x0d7222c54746a0662ec32ee46aa4f79bca7e10a6eb7760c6e44b8881b5e888ed'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2da3c4194ffdbc5de037d66c432cd23d99c7bc5a3e3ff3df36bf47d267dcdbcf'),
    privateFunctionsRoot: Fr.fromString('0x07768edcc86e7e3715bc69b1e2742d6fd62cc206c77ced3eaf7db4d70f3346d9'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  MultiCallEntrypoint: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  PublicChecks: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  HandshakeRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
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
      vkHash: Fr.fromString('0x2979f430e7a6d4c2222a35a5e00f9c8c0e41c5ad9afa95d8d718f5c1f57ac4f2'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x1aa08797a36053880338bbbe96050c7d2903c43a5000624982810e84798f1397'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x208f2d5b84c3129ebe305af8db19a70db08f9c19f1f4064bc4b30db2731519b4'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1dce91df7d251cd4e866d604f100a3bb1f5a4dc9685b37db6ba0a1d19ccd41cb'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x05eef6388f1678ef7a24ed7829a15abf8fb76922ed73477114ff4828e2772535'),
    },
  ],
};
