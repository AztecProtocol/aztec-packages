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
  AuthRegistry: AztecAddress.fromString('0x071ea4633c4ea9ef9a3b81f1e2863b0a49d8dc06564fa215701d99551e457e0e'),
  MultiCallEntrypoint: AztecAddress.fromString('0x2be6613abd23e376f5b9be0034bf2f0f58ee91422b521f1c4d39e4ffac045da9'),
  PublicChecks: AztecAddress.fromString('0x106479f2993a73b878821b4cd0098c9bd48164b32e9b567df009732dabaa65e2'),
  HandshakeRegistry: AztecAddress.fromString('0x23c295a1b12b8f4cab548704d37cff509165d991f05cc7a7f17539ebd5fbb606'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x084f5ae7076b9c2a092f05b0b7c21199a17d38830c84f7ba37e011428b9d4722'),
  MultiCallEntrypoint: Fr.fromString('0x014ca470c4137e0c374831c66336be6c59752e39f632f7d1e1dbaa8e04ea90be'),
  PublicChecks: Fr.fromString('0x24ce4becc7cb6bf880726dc4358b09ada12fb0f7015c32b971822033fc5844f2'),
  HandshakeRegistry: Fr.fromString('0x0d1b71a88eb40f9bfeb3d7a72fd2d0d9ba3e8f647b40450ac5a1cd116d44863f'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x294cf57741ec175652921fd6fbd5ac8bcfe592ad761a5711b66a23b60ba8fbc0'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x16a1c11f78386c8e1ff3d413e05e068a81f88b2659b66b909f7215226553fa60'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x12c44e639e8a6c994c94c913eaf37c7809b1d97ea30d2c527474b09d4367c87d'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x16dc423d685d565f0713936fa5acec94daefe82d92c4306354c4eec35ae8aca6'),
    privateFunctionsRoot: Fr.fromString('0x11ce30d875b2dc0e96b9c336573709c65a2b693d137ae03b8d26b3e32381396e'),
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
      vkHash: Fr.fromString('0x07f07356e170eadf96b7a29dd1932d185f6c518906411a0428d1334e0a980c8d'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x2f13acc8def7a966c5cc4d95d70882034af3c2de72bf3b57c8d48f833fa750e0'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005d4db100'),
      ),
      vkHash: Fr.fromString('0x2ed309f7dc4cdbfda83dbcae2f9f30d42fc86079ad3541dde2ac43e6a9b9b7e8'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x0a8ed45e4a2a43d2143573f62b947f17ec03befe5628adb667f2199d2db9c274'),
    },
  ],
};
