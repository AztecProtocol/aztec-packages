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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x17c5ee2e387ac093f1389456a00020a1f66464a9f8fbfc09305a1af42fe1ff5a'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x29a64a6fd4d83c71ff3506af0c17466751fcaaed7b11a8246431b44697e97794',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x12d7176c11f76549e98d49293b684f5d02b8a6debbf32ad7b0cb871f07bef4bb'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1b36b4248888e589734164ab24bd1ba2b0d9c84d95cd8707720f967637047f70',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x00b9be60c7e314c8088a9bd581fbae940ed7be2ed9f06e3081370010bd4ae6ad'),
  MultiCallEntrypoint: Fr.fromString('0x14a4fd22e07d84f9391cdb7daa05ce62a854ff913d8e52cf0fa89a60c9e39fda'),
  PublicChecks: Fr.fromString('0x0ab2f64082d7799c73d7208fa048dfa0922d62d5de8f82e117b23bf3fe784ae8'),
  HandshakeRegistry: Fr.fromString('0x0d3466727d75e5237f5d18b1da85c60342b1c871d52308e751f5b483ded9d96b'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1801adfab4a0a6f54b81afcb15be3ff68c3cc39521d7906f1ab185fcd3e565db'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x08ef2cc0bac92616d0c265211c20d932e1e74e30e1259d2d72b8d8e0f8f37533'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0802eb3c99acf1b273ddc7b1ae99d1632534b488541a26d2c235ee84df42d290'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x15b25de72cd2503222a7b877e2dcdf837e9c74a90842daa9001b2de4e2b67653'),
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
