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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x151fc83ed377f7f5eafba69c0dd923a27d3940c887a0c2738de3b3aad8539d37'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x24bf02e35ce6f82e3ce17b39c7400eeb16b48c76527207f236e1193f07b2d4f4',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x27ead321a0a230af4bed665c30a6d85b3e0eddae03d5f3dc0c5d4687a7ecfb43'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1954c59d82062c1c4733a33284fc81c7d0ed65de93b683f72430047224866484',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x151d75f71db863281277cea8d9fb901509e735abee16e3c415b2de1cbe35d0a2'),
  MultiCallEntrypoint: Fr.fromString('0x0c29e321de18a6d87363a54e927444079675f4b44ccc2baaef93432c003a740d'),
  PublicChecks: Fr.fromString('0x119aed3bd453156b28f9455a56283a419bd74ec314ac1e78f603f4f15bfaa424'),
  HandshakeRegistry: Fr.fromString('0x1e5b9549f480de778b5a715880d977ffae790239b659168f5e53cda9c2218ae8'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x080d146ee61f80f37e18a2a4c2483744c828e9384e716398f3b9fedb5b4a5cbc'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0e2d5d2b2e024ae79d4df7cf4ebceb1b8dc98a049b05a79353feb76c9c2785a5'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x07dc17311a81557c8d63369e7ca1eb2c121e98407b338ef61e406003e2246928'),
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
