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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0066965afd4772e6acb9e4e49db59d3b248f6ed1883ae566fd5d67b26369f99d'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x1611308f8227c755f7d899b2649292b2d22e79d052835f21eaac0034bcfdd4d5',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0ecf1b55cbe605a5c8babe1cec9ed9cc3756ea226606318a137c1240873de0b1'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1fb91bfcbb30060c3ded80d0afe2ecf5b0847417a291e1cbbf0d51ffb9eebd6c',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0564d5361fd6d7501baa1706a59bbebd2035d1c2565c9e5daf8f1567da547a23'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x126ab69e8161771b52273d00dbf5d7252ef6a92724d15f1ec2dcc967118a0c7b',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x077341cf79b91db9c440c49786fc4d4508ef3ab623c30fa3be7031ffcad4754c'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x2f8592fb5b1620f33d21d9b67a34002f0e5392d93807a684584af388e0d70741',
>>>>>>> b08fabd8af (feat: merge-train/fairies-v5 (#24519))
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x2ec57019ac5978ee769c6864eece7d9038c3895ceb2881f653f2f72ed770c96a'),
  MultiCallEntrypoint: Fr.fromString('0x1ea984cc0e2f8b7f23df40b24d0c6fe6648ba97962f0c4000095a73fdd92a703'),
  PublicChecks: Fr.fromString('0x06e1133f98fbb625866ce88ec40517f7faa95eafe509083373a5201538132e08'),
  HandshakeRegistry: Fr.fromString('0x2f375e6424fc997840fa691807dccc0164e0a0940240a70cc45b7a7bd25f62b5'),
=======
  AuthRegistry: Fr.fromString('0x197cba16b38c5408694cec7188b9128e80d247596050e31a0d12249b60b360e1'),
  MultiCallEntrypoint: Fr.fromString('0x24e025d7b0d3158d69197dbabf2baf18db0b1dd4ff3c87ec2ed418fecb0f192d'),
  PublicChecks: Fr.fromString('0x000a3012fd5d88921976565891e19c0b9a6a753eaf773e9493f47c890089bd08'),
  HandshakeRegistry: Fr.fromString('0x20e14f4a6ada38f27144ceedbfbb7417aca6c679ee1ea09b9435886ed7faf3d2'),
>>>>>>> b08fabd8af (feat: merge-train/fairies-v5 (#24519))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x193f8d6eb359386a88526e9de0fe1685b85f5f083e075759a7d555670b36ad11'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x03071f732833fceb53f2c3da00b9f5bc0715c94ff37b6e01c78619f63ce88858'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1cd917fe9b02a80acce1880672e0ddccce831ec2e96d9cdd03a4d416cc83abac'),
=======
    artifactHash: Fr.fromString('0x17bd6a48fb22fb700a16d5767f93e08b2b21bf83c280cb61abe763567179601f'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x13dfb7aaca5d32bb876650f6afa5531d7c2c946f1cf927bde230755017af91d3'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x212730544c282ed52485a69d91a2d46adb5a5e6cd23e8c26c3abc6de4bcc3714'),
>>>>>>> b08fabd8af (feat: merge-train/fairies-v5 (#24519))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x17ab203d89c6b6301da0171584bf2f7f24d87fd5ed7ff6b93bc9243847c1323c'),
    privateFunctionsRoot: Fr.fromString('0x11a10bd77aa19bdb444e8488129db440f64e291ddf781052e298a593b4941de7'),
=======
    artifactHash: Fr.fromString('0x01b39b7d8576cbea4e4eae792c4538a710d0ac2ea0361364c57d0e2b4b1a3474'),
    privateFunctionsRoot: Fr.fromString('0x02a4dba36389845b8ef0108562f7536d3284f07ca678558fc3c3bce3b24ee821'),
>>>>>>> b08fabd8af (feat: merge-train/fairies-v5 (#24519))
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
      vkHash: Fr.fromString('0x1bc6ab9244a92fe2143e42a1856ea0b29415e0530eda89dd634a0b8630780593'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x0557df5ba7ab8ecdcf13754da6cbedff4c0654d87a4138b6eabfebe414a7f35d'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1e4bc826140c11db39be74ec35c18cc8302b408691411b0d2576981bd80ef7d0'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1f04747f14e80766fc5f21879674dba7e8b5a7ec1ac5506d59252ad433b76f72'),
    },
  ],
};
