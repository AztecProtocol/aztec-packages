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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2a04b40348245095cccd4fc589892b2750b13ac64de0a2f652aba267e3d6343c'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x174f83d4d14562d931c97c88232c91de84360a2d6910ba86d3722c4021b1f118',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0aa4510853028822400ac43435975b7e5eaa89c3bc92f569e480eb3432f344dd'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1c716fcb76373b6db06bc21f5afc6b166bc6b14efc15e36c78d9cf1599a55652',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x294d11419201502324a697ecbb544cc541b9f0f29f945707c407ae69d31e8536'),
  MultiCallEntrypoint: Fr.fromString('0x20ada02970269aa3c52d0f7b005719a58abadf0953e4e75fa3b3a3c026673ef4'),
  PublicChecks: Fr.fromString('0x044176148f1d62ad3edda90a3d4155f08ace2efb8cdfecb3db2c76424c5ecb5a'),
  HandshakeRegistry: Fr.fromString('0x2d0b6961277eb96b97c837ed26a3d401a4d9c4461a1f89dbf0260f638af4d0b2'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x126df6d69f7caa2ec8a69c1b437309b0a390c134fe1703f6fbe0cfefedcbb48d'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x202d086901665335ede0460e6ba9ae5f3a8c94a8f48d95883f5f39a3bf2f55d0'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1444a6afc0dd228a7c392edb58402c4c5dd8ee1ec82731c5be8a5518984b11d1'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x0def336d45656e775d19763541e02c5697b81358bc1a73f05d4931d68f828e47'),
    privateFunctionsRoot: Fr.fromString('0x210005afac321d46062b486f4529ef0965d6424ce2809b8d185bbde45dd9a874'),
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
      vkHash: Fr.fromString('0x06a5c1b3a636c954a90be43cb56a4bdd9dc8aec764151a012e0018753694ff54'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0b19b2f937f2581922c2ead5411ad9ff4ed9710efe9849bde494d9a0f94812ec'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x24a5009abf98486f293acf95708efe4b3783e08d766a0cd859507c12e0ec97ab'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1e929ad624dd437a0cd1535365a4c6fac11a5f9746bad00a969d4c1eec74e99d'),
    },
  ],
};
