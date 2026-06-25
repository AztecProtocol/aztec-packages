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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x20271dd7dc37ab17324a0efbdd39b8e4312dd824de3365b853641da5c5e2b859'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2837c8fec9af914d2acee41e5f793a43cd49250869df6da6d301c08fc4412af4',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x19f5754582cfa9d5fb0a01642583334d386e873cb49ca36c1b2fb0fc27087129'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1b36b4248888e589734164ab24bd1ba2b0d9c84d95cd8707720f967637047f70',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2b88976a7789bf13346676e75618c6afb1c98cdcd8a8c48816ade14576c6b26b'),
  MultiCallEntrypoint: Fr.fromString('0x27f937d6434d9fa2b60ccc405af71b0d5969374837c28a0fa853e8d5e4c019f9'),
  PublicChecks: Fr.fromString('0x0d1943024be54a787298704b1031cf6af36278662dc679263aeb9d0eb8ea8dc1'),
  HandshakeRegistry: Fr.fromString('0x0d3466727d75e5237f5d18b1da85c60342b1c871d52308e751f5b483ded9d96b'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1b1e6bea6dd8e3db000d4d8896dc1472b78f36da4583db765f6760f4b7dae92c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x0df8580d114ac2c7917af2bcd285c66438fa16f24614f1fd134128e8a35dfba5'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1f7f75a2ad4b49187087e9a0092de3f195bb1cfb283f287db3108781fa20ffb5'),
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
