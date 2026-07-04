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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1cac734679703a126df5fb4d9e40bbdae3b9a16777e46863f4a4f4271dce9390'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x09331cfb6aaa2ecf263cd325dd4a4eef9f5dbd2caf31e73bc6bc1cbc7c8c3eca',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0bd3da430752caa1c67904e87e8be5cf076f4aacacd96d7efa30a05b86950b8f'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x2e2f664d40e3beafb08764dc30f365532dcb7b802efef74c0e36dfe6f48a989c',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2ae9560518defe569142b5ebfb1d91274d18630a314e4b3b724844bdf65191c7'),
  MultiCallEntrypoint: Fr.fromString('0x18ac65ca493b64cdace6909bb1ad394f6cc90724cd629a61974384897488783c'),
  PublicChecks: Fr.fromString('0x01eab218574ee39984a249d10f54be9270e5431720f6550434b701a1aadaa9c8'),
  HandshakeRegistry: Fr.fromString('0x06c29e8d1f9c164dba7cba6b6d3d14501f9929d561bf51976e82e8eccf186299'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x073980bd8a697fd0161add1976094605e72db2c01994f7696242b86eab65eeed'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x060a1486084d5064a08a0dd20c0d453b3983524c4b01134fe944bad598eae7bf'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2af2b831c892ae978ed9445b0602696182a5286269c7a9bbd257be15c926297c'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x25bb3f7badae6b5210b95d3aba3806164fbff87213cede294ea2069902da0eea'),
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
