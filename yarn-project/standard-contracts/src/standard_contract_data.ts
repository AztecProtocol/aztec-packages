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
  AuthRegistry: AztecAddress.fromString('0x1827a31a7656fc4e6b737735ece7ebc56177f95292abca622e5bc2e8811581c1'),
  MultiCallEntrypoint: AztecAddress.fromString('0x29e7142fb980786c53b3f20c755b9a1e69893de22e72ea5ae649c2b76bb74902'),
  PublicChecks: AztecAddress.fromString('0x15a00d1e43029f5e5de746eaf203cd0e44d1dec207f0286571afd2bf7c909edf'),
  HandshakeRegistry: AztecAddress.fromString('0x1ce6060ead69003e9e69d9b75bfa7af9158011538b785554ba38d499ed3ba131'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x025aa3fea41e13e97d8de47242a812c6de248aff902173e11b7f64c583fb992b'),
  MultiCallEntrypoint: Fr.fromString('0x1320c63752e4de46f9d4a1f5e99e1aa58a7eb64efc9a78dbef7828955ccae29e'),
  PublicChecks: Fr.fromString('0x0a56568bdee5f5933f02e1f3c3f01068975f4d6a387102393307ba98a170eb47'),
  HandshakeRegistry: Fr.fromString('0x11ccb8e55d390ce7fc446793cc03317e1529f3e6f56e88d67ed1ae99ec7594c2'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1d059a4385a4c32f56b84bb95e02f2ac4cab27f03d3556ad4ac0890e61bed61c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0e9e8fec07b19ec134917f9ce28ffb2894a293a7f9e47c3b4aa75ced81456b7b'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2e87d9759e00ca2fce4802372ff15253701239833590dd938eaf282d9148f03a'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x0641be0cc4a5eb67f3b0a1279b088a816d0c7f57f48d8532716bb8645adaa61b'),
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
