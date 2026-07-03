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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0e7d3c56a185c40e4ce459eee03075b7dee2e9dc8f860157063afb3fde5ce097'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x03264f902d92f27dd0719cd6f5cc9c9d03ec6f5a48482e2158ebc2886e997210',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x05b4a7bf960bac46cc0c22aa6ee5b663a928787c9e7410fcf99e78182f634c0b'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x26f11691c7efea98db7eb7b4460cbc3f75db19772db2c2dbb8978979bcc5e388',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x26418de27e7959352849f02436843dbdd033d69fa51a4bc8a60833c8b6fca502'),
  MultiCallEntrypoint: Fr.fromString('0x19770ce1522e502ad5bcbc28e4d4affe96d1eeed61f366c87bc1e7214e44a567'),
  PublicChecks: Fr.fromString('0x014a933a6759d143181575cf8bb9092f297ad9f6dceef20d5b0ba61369456a9b'),
  HandshakeRegistry: Fr.fromString('0x187a5ae492f5eaf202d69290eb70b1f07315160434ba816a1ce22627bad4b6a1'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1d2d505dc0a133d307dd6e121f9adda51718c5c61bf9239a277e3745897da935'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1516cf4369b08c199f52a71fa2205bd13c51a53759f4a96571c48310bf026592'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x04bdf54dbb0a90ccdd5659ad29b1b8206724e651c1d60f8046a0771496d26211'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1c4cdc2834480eed826aeece9b85ffb7bdfe751a01bc76220e3fa12527a9c932'),
    privateFunctionsRoot: Fr.fromString('0x02a4dba36389845b8ef0108562f7536d3284f07ca678558fc3c3bce3b24ee821'),
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
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x25d87da668c7c52b9c521579f191bb02486b3598d1ec0063927d5c0af2608daf'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0f59fe525df9ff4a400e33dec33fd1dc07e25d95f860734a35b909085cf07809'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x12f43f384aa64661b012b52b1d80eb1d2202b8e459b50f56cfe270b0672c16ff'),
    },
  ],
};
