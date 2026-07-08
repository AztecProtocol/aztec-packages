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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0292b01f4e566555534c40ed729eb023cc08afaca647b8c3642738449673480c'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x18470168ca7a775b442cde110b668732f7b6390a505f3784b50f39993c5f3dce',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2d7745526508f5ceb278bb773a49f776842d1d2f0854c4a385bb661a2fabb9a8'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0bd62e76a9a3a103dae2e73040e05d3970ac900baff5637ae9f183396745ec7e',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1f8810cff8690ef53281da87fcda9d4820154d6dcd76012c90bf459b3ba3ab7a'),
  MultiCallEntrypoint: Fr.fromString('0x282930170063677f616bcf9dc9fbfd4968a577dbbcdec0ea3c06283a44bcc743'),
  PublicChecks: Fr.fromString('0x2a0f1592c7f4c979b328ed030039a4e9a469aab30afa3a036735c338067abbcd'),
  HandshakeRegistry: Fr.fromString('0x10fbd0602fe72a04c86e25728c8c2b94a359c684738768cbe4e44fb05f6a908c'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
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
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2fc28e54f5f227307378f4620d793db72a4e1a7937e8cb31396b61a48ea7abef'),
    privateFunctionsRoot: Fr.fromString('0x14f4bfbedd0d76e9b66d1f836a71457cb0f5b4f40280eec4a3ed40439440e252'),
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
      vkHash: Fr.fromString('0x0b9ec5c76f08f8025800691659d7ba1432ddb8a30e40fdbd4d8f5c398b8c9ab7'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1c0f79ad358fc72c0f8cbac535d2d67f49dcea2f7d6c658eb38c7669f8ae2f93'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x2c2961a5e83daa909242c9ce441526c0a95379fda0976877acba4ffe7be949f3'),
    },
  ],
};
