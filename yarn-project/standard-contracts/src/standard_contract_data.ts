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
<<<<<<< HEAD
  AuthRegistry: AztecAddress.fromStringUnsafe('0x151fc83ed377f7f5eafba69c0dd923a27d3940c887a0c2738de3b3aad8539d37'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x24bf02e35ce6f82e3ce17b39c7400eeb16b48c76527207f236e1193f07b2d4f4',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x27ead321a0a230af4bed665c30a6d85b3e0eddae03d5f3dc0c5d4687a7ecfb43'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1954c59d82062c1c4733a33284fc81c7d0ed65de93b683f72430047224866484',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0292b01f4e566555534c40ed729eb023cc08afaca647b8c3642738449673480c'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x18470168ca7a775b442cde110b668732f7b6390a505f3784b50f39993c5f3dce',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2d7745526508f5ceb278bb773a49f776842d1d2f0854c4a385bb661a2fabb9a8'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0bd62e76a9a3a103dae2e73040e05d3970ac900baff5637ae9f183396745ec7e',
>>>>>>> origin/public-v5-next
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x151d75f71db863281277cea8d9fb901509e735abee16e3c415b2de1cbe35d0a2'),
  MultiCallEntrypoint: Fr.fromString('0x0c29e321de18a6d87363a54e927444079675f4b44ccc2baaef93432c003a740d'),
  PublicChecks: Fr.fromString('0x119aed3bd453156b28f9455a56283a419bd74ec314ac1e78f603f4f15bfaa424'),
  HandshakeRegistry: Fr.fromString('0x1e5b9549f480de778b5a715880d977ffae790239b659168f5e53cda9c2218ae8'),
=======
  AuthRegistry: Fr.fromString('0x1f8810cff8690ef53281da87fcda9d4820154d6dcd76012c90bf459b3ba3ab7a'),
  MultiCallEntrypoint: Fr.fromString('0x282930170063677f616bcf9dc9fbfd4968a577dbbcdec0ea3c06283a44bcc743'),
  PublicChecks: Fr.fromString('0x2a0f1592c7f4c979b328ed030039a4e9a469aab30afa3a036735c338067abbcd'),
  HandshakeRegistry: Fr.fromString('0x10fbd0602fe72a04c86e25728c8c2b94a359c684738768cbe4e44fb05f6a908c'),
>>>>>>> origin/public-v5-next
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
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
=======
    artifactHash: Fr.fromString('0x1bfa3469d2f70892f9ba54117abcf4ca52bb758e66be19b5d0ab86600202ab73'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x05d7e89374f90684063f132a79de9b0f9553508de9ec1b83b8f6110d6ebbc21f'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0636977743e164f84fbd38ca408ad33794768c994f28dd8609729a8406d352dc'),
>>>>>>> origin/public-v5-next
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x294711bb2ef12f26c51f754db9111ff4a5ebd7171d42e7ba7c6b638a8b09b650'),
    privateFunctionsRoot: Fr.fromString('0x143d27f4e317c85f2838e6ab75a01abc21ebf70ee72383925c4c93fbdf60427b'),
=======
    artifactHash: Fr.fromString('0x2fc28e54f5f227307378f4620d793db72a4e1a7937e8cb31396b61a48ea7abef'),
    privateFunctionsRoot: Fr.fromString('0x14f4bfbedd0d76e9b66d1f836a71457cb0f5b4f40280eec4a3ed40439440e252'),
>>>>>>> origin/public-v5-next
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
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0158cac20cbeac38d25cd99c907644549abb7e668496f06cb2c6fd5da47b8f32'),
=======
      vkHash: Fr.fromString('0x0b9ec5c76f08f8025800691659d7ba1432ddb8a30e40fdbd4d8f5c398b8c9ab7'),
>>>>>>> origin/public-v5-next
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0dd0ed2bb842c543e34b12c98ed56686dce0bae7e7aa7527dc5d42f36f039947'),
=======
      vkHash: Fr.fromString('0x1c0f79ad358fc72c0f8cbac535d2d67f49dcea2f7d6c658eb38c7669f8ae2f93'),
>>>>>>> origin/public-v5-next
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x25f309ba580e48ec868bb75656274359f8a597a0ead0739c94444b9e609e475f'),
=======
      vkHash: Fr.fromString('0x2c2961a5e83daa909242c9ce441526c0a95379fda0976877acba4ffe7be949f3'),
>>>>>>> origin/public-v5-next
    },
  ],
};
