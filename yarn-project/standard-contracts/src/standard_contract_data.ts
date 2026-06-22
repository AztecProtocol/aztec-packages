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
  AuthRegistry: AztecAddress.fromString('0x1d176230f61d73b71c827f12e099874f138905aa3784e69c119c91d7cb1125d8'),
  MultiCallEntrypoint: AztecAddress.fromString('0x089b0b60585debad01efb9015c2ccd7dcebd110c21b9a849800834239514b5d0'),
  PublicChecks: AztecAddress.fromString('0x1c56ace35c637148cb4f702cefd44a1ff21167209a10bc16a01c4a9476d0754c'),
  HandshakeRegistry: AztecAddress.fromString('0x0b4ac773e58c529c83a4bb27b5b876eda4734f875295e518e89fc542d89d12a9'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0bb4380f7bc862ee40b3de9e06c2c37a74364ebfaab42e12aa96a98fbdb0f1f8'),
  MultiCallEntrypoint: Fr.fromString('0x1eaf81c0f73b75f18d224a6cfcd296abf043412fb36d5452ca602c2175f854c9'),
  PublicChecks: Fr.fromString('0x1fe1682e73ff7d11309794ed54836e3092735517240a586c31a7edc5f2b5628c'),
  HandshakeRegistry: Fr.fromString('0x2dd3d466faf08b1442b698e5e3991909327c80c52c573e981b3ae435798b09c5'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x28b53e3551fa25523703c8197fbff270d1f509e4f6c1ce8bf40f78914fafa033'),
    privateFunctionsRoot: Fr.fromString('0x1cccf2cc69672e6de029da266622223fa2534e2bbe98ee1092494ea43e22dede'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x15076133913afd56035d428fd20cd5b06dfacf8b59b331e39608bbb5a025fe7c'),
    privateFunctionsRoot: Fr.fromString('0x072382525bde606daef6fc7162c54d68330d073e6a415d252c8c5f99e143ec6d'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0c500136f79fe4360b2384753f139b1b926ef1b9d97116bfbb6617cd3f2a13ef'),
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
