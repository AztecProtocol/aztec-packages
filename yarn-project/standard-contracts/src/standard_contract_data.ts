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
  AuthRegistry: AztecAddress.fromString('0x2d448e562823f01746847d8bf0292e22e2de647945da068eeebfcccf06b46212'),
  MultiCallEntrypoint: AztecAddress.fromString('0x2ae1cbf2720f6caf7e4a5b7e208f6b902b4be14bb1ca95af87771a1b838276e1'),
  PublicChecks: AztecAddress.fromString('0x14f08df42fcebb313a9963b1c29d56fa82b75df408e3909cb594f59812fad2e3'),
  HandshakeRegistry: AztecAddress.fromString('0x0b4ac773e58c529c83a4bb27b5b876eda4734f875295e518e89fc542d89d12a9'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x06d1c0eed2c6b639dbc4b7fc3df442c014ac53a3d4febe801958c6f1b73aef2c'),
  MultiCallEntrypoint: Fr.fromString('0x22519ec7588f4e51b410c7a0a561ec16b84abd2f71257907042e033878d34d2d'),
  PublicChecks: Fr.fromString('0x061b5ca44ceb1e06defe5537cef9c95a1c41be55300be16a2f8b81c4206e5d01'),
  HandshakeRegistry: Fr.fromString('0x2dd3d466faf08b1442b698e5e3991909327c80c52c573e981b3ae435798b09c5'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0a2e24de4f3ddce25daf854e7d4a95ebe72760dfb8c3ba6dd0ed5fc03647a6a6'),
    privateFunctionsRoot: Fr.fromString('0x1cccf2cc69672e6de029da266622223fa2534e2bbe98ee1092494ea43e22dede'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0d07c1d7a1e1b31ed73bbfc71a8e305be1fad348f8188cd2e2155cf0c9e25f9b'),
    privateFunctionsRoot: Fr.fromString('0x072382525bde606daef6fc7162c54d68330d073e6a415d252c8c5f99e143ec6d'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x198e2a66fb6787752af565a1a46710c3e4bccad3c32f1ccebd17e5e2d9178ab6'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x01115806a86225c7a4e31dc477c2162dc215b02684d49a43726b300ebd733979'),
    privateFunctionsRoot: Fr.fromString('0x2348fb38c85930889556ee3241f9216109c22c104bdc40ba3514ad6cbee3b5d4'),
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
      vkHash: Fr.fromString('0x14d155bbf15c2eedd17b32446f7527cd7d4dc3e442cd3e4b2dcc8f2014bcd23f'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x1dc975fe23b0cd360221a5d52f91cd4cd570882bf9339c7340ccf205b6c6661a'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x038c0b16beddb487efeb2c602fc49dfa6ed6f53c592c3aa2915b95d2df7c8d95'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x2f75cab8b36fa6b58519d37fbd55c181fc6005055eb32f59416ca1fa06ae089e'),
    },
  ],
};
