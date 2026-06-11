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
  AuthRegistry: AztecAddress.fromString('0x1f416ed6bb14e635007fd079e190f387db820b0d494548ffee2dd30fdcfad9cb'),
  MultiCallEntrypoint: AztecAddress.fromString('0x043f2525f71ddb53f9e8ce773208f95c4affac3ebbdfdbb3dffa4a09b53a7752'),
  PublicChecks: AztecAddress.fromString('0x010aa477651bea7176e8a9b57258f191bff7175d21139af22bdf37442e400b94'),
  HandshakeRegistry: AztecAddress.fromString('0x02d0ce6b4a65ccebf7cc44c1234946c45eeefb36601cc1cfdc751f9b3e2bd2ac'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1b70af6faffe99f34b4c1b94f977b391f1b3c74a8c0c727c012576e2ddb7ef3b'),
  MultiCallEntrypoint: Fr.fromString('0x0f94bc3991fa9d648ac258109f687964d9bee021cc377d42974b448dd9b2cd23'),
  PublicChecks: Fr.fromString('0x2b92b429f3752bd8b7b074dafbc7c0ee6045fcbfaf9605225eaac784bb80e59c'),
  HandshakeRegistry: Fr.fromString('0x2657d7b9e196e7194a48c1ec287390ee8e9dd549da3897d7dfbfec8b258745b1'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1054a1200743607b265f6df3171a9da3900801da68bfc2040efac4a52e2eb34f'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x012128771c74efc58d026f388b23e6236c6c663c1aaaf148d3283600b4c50b9c'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1d830692bc727bc4c902f60bc578c14824de80c8af218d858827c0d28b12b492'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1a6c4c88f49165d5749ff369148e87b4abf7cf1dfe321f05bd9a61307c8ea505'),
    privateFunctionsRoot: Fr.fromString('0x036eda1767eb6467658c15d26b4f97c4c3b42d15dc0896f04d92410e17cf0e1b'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x0b8515596aea2f7bbdad301c7d2b57c64673b10ed5c597f1edd661c59e9367f1'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x1f619376a7a08d4f1ec369c8b66cf8c773389c1ab0ab20d9c72c6b93ba4255cb'),
    },
  ],
};
