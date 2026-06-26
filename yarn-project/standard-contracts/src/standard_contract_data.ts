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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x13dbf680ef8676cae7d0034052d38b49b1080fe09f094b777b9cac5f041b46ba'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2c56ddafd687f477d398bfc686ea8e8779be39a81cfb33f9c197112ec1350f31',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0aef840cd35c579261b65c8fb2083dca0662eb07a3db5b17c6fd2175ab7c9f38'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x15afc452ed843b2007414f6c2228aa5bd53e0cfb7011a5009e430b29d1fe11d4',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0013004700e0f1b382ddeeb9e405788a35031f40619ce55293b4323fae8a569a'),
  MultiCallEntrypoint: Fr.fromString('0x1a3d0e91ea04ef3f8da40d75c724bf43bc01a5ce3a7991cb1f902d77edc183ec'),
  PublicChecks: Fr.fromString('0x2c121d59240703645040afeaf04f7e8e5c5db3a64ebf0dfcf1f5ee4067422cc4'),
  HandshakeRegistry: Fr.fromString('0x262ce441e5c5592372d85b11002da5aa56ad715dda5834d08c9a0f8526ab5342'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x077a69e4368db99472a3bea0b74090734d9967dd724e9d76113c7a8f8a12b768'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x01c0224820a99f3d794a86b59a9bd12847fdd932b0caee02c15df445b814630b'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2bd6b8a8565786e202bdf8f6b642c136e3107df5c1aa124c4a00a485cfd993d3'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2c5769a4fe081a0485e6916ad1baaa5f2ebcf1500dd777715b234ba311f450c6'),
    privateFunctionsRoot: Fr.fromString('0x13c6ea42ad92702a4690fa562e8dc3eb0e1f6e23abe883a5246c7140d7acd153'),
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
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x17386be4ab92e7ac0c202d7027dc2424e6c35c06a9ac56e7bb01eb9dc9a2ef6c'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x187d0ad185898fc8d5c06e2fe5e26889b124fa307602f152b3af5cfd988b0602'),
    },
  ],
};
