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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0564d5361fd6d7501baa1706a59bbebd2035d1c2565c9e5daf8f1567da547a23'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x126ab69e8161771b52273d00dbf5d7252ef6a92724d15f1ec2dcc967118a0c7b',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x077341cf79b91db9c440c49786fc4d4508ef3ab623c30fa3be7031ffcad4754c'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x2f8592fb5b1620f33d21d9b67a34002f0e5392d93807a684584af388e0d70741',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x197cba16b38c5408694cec7188b9128e80d247596050e31a0d12249b60b360e1'),
  MultiCallEntrypoint: Fr.fromString('0x24e025d7b0d3158d69197dbabf2baf18db0b1dd4ff3c87ec2ed418fecb0f192d'),
  PublicChecks: Fr.fromString('0x000a3012fd5d88921976565891e19c0b9a6a753eaf773e9493f47c890089bd08'),
  HandshakeRegistry: Fr.fromString('0x20e14f4a6ada38f27144ceedbfbb7417aca6c679ee1ea09b9435886ed7faf3d2'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
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
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x01b39b7d8576cbea4e4eae792c4538a710d0ac2ea0361364c57d0e2b4b1a3474'),
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
