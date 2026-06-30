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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x215c3cdec8b293135f02d3a9d217d18c446375ebae124dcde6e7854f7cc83c34'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2cbc2589582f2912abd95bd63a7fb6f55eb3eefd961b7898dea6008b8f10525b',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2aaa467f750cc6806cc19392045e8940d54763bf8c0cee9b8896b207ee01415a'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x18f1fd280f678d062b43520d8e59b98b6b48a7c4ff7cd2dd7511799ffb0b4191',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2f795da0b6834e302e01d3021b7ba65fc5e096e0720d4316459aff85734c13ec'),
  MultiCallEntrypoint: Fr.fromString('0x2adc4a8074852763c4085173f9f9247bbabaf30ce462908587e49d6a95801128'),
  PublicChecks: Fr.fromString('0x176c4d4be808251059342618e7489a203ab02f538d4b12498b9bd28c8f46bef5'),
  HandshakeRegistry: Fr.fromString('0x02436e122c76e19caf303ccf5b04097414653b617f0c65aebb6f7d2fbd077b1d'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x000b8f6131ef6d0dbd04b49b453f053551581e52f1db6d0b3f28c06bb225eda7'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0a608dfc9ec63f317c91fea449d3f9935d5e6cd2f2ec709bb4ed2ffc708c07a6'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x26e9d24bd0619bc3663c056fe0e73db8c4d86d7695030898f65cbb48b4a05cf7'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1758549575a28f993d0be2f33e544c321bfb6e8dda5d969c2fef1025d5492c13'),
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
