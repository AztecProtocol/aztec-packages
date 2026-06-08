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
  AuthRegistry: AztecAddress.fromString('0x2ca2bcacc9f0adcb13745e36f65f98bcfc126a0ca833d25dd0c8ad761eba2e20'),
  MultiCallEntrypoint: AztecAddress.fromString('0x072aaacb46d0952e731a8fa55c572a9be887fad39229503bc4b445c961479175'),
  PublicChecks: AztecAddress.fromString('0x0315098de9ecb52866f3a59c11e2609084decb39e4239c11a17b46a058ac6953'),
  HandshakeRegistry: AztecAddress.fromString('0x08f8f482d998c82a6e20634e9d36726af26e5fb2466c2f7c79789882a68d6bdd'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x023c01fd7a662b87a46f99bbfbb312d80f3e901c7b6a10f9807e148e3d48899b'),
  MultiCallEntrypoint: Fr.fromString('0x0f8764aa0801f5e5928bbb8f76d6bd06ad298421cf980ac8c4a869544c457274'),
  PublicChecks: Fr.fromString('0x136e4c36ff79e3b2afb3a2d8ded6423cfe3a2ae02b1e25ccbcc93f623d9a0dc8'),
  HandshakeRegistry: Fr.fromString('0x0cecc64ada402867fa2b9b2e8f6846121af0574543e73c88ab4925c48e55193a'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x2241fc215cb7a88749062212179bb6ccef51308a3676ab7388b014b4cccdac24'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x02ad5430558d0c33af35f6d0c15a4b50c224793c0685c5d81b2592d0d8f53c0a'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2360f01de5a72e28e7748eb6602143feaa8a7b30679474e6a637f2bca386646c'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x0551faeecde87f872db8e1b11b10be03cba9f999fbdd6dd53bf994a833931ba1'),
    privateFunctionsRoot: Fr.fromString('0x0cf78fb872901f2883a6f9e940156658f5b317f4c437d80a67eb2a47d3bfc0c3'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005d4db100'),
      ),
      vkHash: Fr.fromString('0x035db3173b6dc6305d989fe910690cc0a556bf30261c6b4235144403e5378635'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x086f9209118872f060094869666a20edb9ad69272c3a1b12fc93dbe839d271c7'),
    },
  ],
};
