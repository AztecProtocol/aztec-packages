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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1af29ee1906dc45b31b1044cc138bfcf8447768fe31edfeaa35c2322d1706db0'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x0cbd283387c0fbdf4836c783720a1a616daa53372e5e5a392f36cffde13e90e8',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1b43e94ff8a001589ae14968392895b6699a9bc3e652a197fe09548d0b86e95a'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0bf41bc2af772cf45410418634ac60cedd51a551d95917f8af1158eeb65752c6',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x21f5c1f862f9bc34653f1c52b21df5f5eeb464c30b93d919eff1a63bd2b3a652'),
  MultiCallEntrypoint: Fr.fromString('0x17e6906128e72167e90022fef7c4a9beb6fbdebc3e532029877027997aca35b9'),
  PublicChecks: Fr.fromString('0x0feabe5e17d9693920c790c82617575dc5674fa0e8fc05c9ccd6950586f60094'),
  HandshakeRegistry: Fr.fromString('0x22612bd9e2ea5a1565ca5bca99a902994981f1f5ce25c43a8edbbbcc6294349b'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x26ce6b394fb55485cefba9524e6d444b46bbbfa56252b8610bb0f52eae8f7805'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x269f2c9e5d1148756369bdc82b71d5eb508fc81ce83f2fc6ca136268aa7130b3'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x129184207047eacb67b8fe13e65b883d8c6999946cb0a9d16cc946147a2071cf'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x246f849cc0ce24ed2e87f9b1095bb46569d2f2ade761ab8ffe391e79c1f2bc09'),
    privateFunctionsRoot: Fr.fromString('0x1dd9dd6c827051727df13e83fab2d454c5190549d2d4b22599fc79b5e47184ca'),
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
      vkHash: Fr.fromString('0x09c47076467af1ddab51b9aec84c2175d6af91d27e71deee4a6c38a86a07b744'),
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
