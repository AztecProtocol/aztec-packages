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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0395a3eea70be9086f761c6fb5f8bd9c4a28c6d39469a166ad3d4c6287d3c344'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2954dc74363c2d466b6a5a0b56657daa652d58ed286ae659190a1523be800791',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x25ba11e9732f0af0fe004f8b91198769d9590245128a79f969a769d10e5948f8'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1954c59d82062c1c4733a33284fc81c7d0ed65de93b683f72430047224866484',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2fc16b7670bdf82cc0e84df146aca14469c0d23a63c2366442f5e78ed85134fb'),
  MultiCallEntrypoint: Fr.fromString('0x2423083b5833d9587fe76d77c7b771f3b0c48d1a49f3b2b82ad3cb75c1232afd'),
  PublicChecks: Fr.fromString('0x267c0798341208049d9f47b40bfa2271ea897fd58759c3d19902d271c93a4bff'),
  HandshakeRegistry: Fr.fromString('0x1e5b9549f480de778b5a715880d977ffae790239b659168f5e53cda9c2218ae8'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x06078beb942a95e61352abd392ab0cc6e222a09658ecd2089e765b83d5c59252'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2dadf146059f8b6705887dd0181e08cd9662e718084b6fc8bcd24a4c20e612e2'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x16a47f3bd69fb0aa51929532c878915f5e81769b87bdcf763551a71ebcc5a754'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x294711bb2ef12f26c51f754db9111ff4a5ebd7171d42e7ba7c6b638a8b09b650'),
    privateFunctionsRoot: Fr.fromString('0x143d27f4e317c85f2838e6ab75a01abc21ebf70ee72383925c4c93fbdf60427b'),
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
      vkHash: Fr.fromString('0x2d46cdec4cc2afd813ba2b50106dba455821e4c7b3c10f1c7293bbc759dccf64'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0699bae67183ce084da1cd76ce05d18f45f796237f2baafaf7d4bfbf9663c433'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x0158cac20cbeac38d25cd99c907644549abb7e668496f06cb2c6fd5da47b8f32'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0dd0ed2bb842c543e34b12c98ed56686dce0bae7e7aa7527dc5d42f36f039947'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x25f309ba580e48ec868bb75656274359f8a597a0ead0739c94444b9e609e475f'),
    },
  ],
};
