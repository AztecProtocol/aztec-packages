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
<<<<<<< HEAD
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1d57a9c5374e51195513bc1d1b40f4fcb70ab20a8f0a90955f9bdb7c558e6200'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x104ef9fb11bb6e701ca7b23fefa997b4ae4c35f82f86a1578c564679e70a4d45',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1d0f36676c5800cead9897333bd9bd610c06f76b69bd71f86b1e03b939c5752c'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x114ac462f0240d4aa248fe44132498e762238245a79ef3380fa40b9b13aba5ed',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0e7d3c56a185c40e4ce459eee03075b7dee2e9dc8f860157063afb3fde5ce097'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x03264f902d92f27dd0719cd6f5cc9c9d03ec6f5a48482e2158ebc2886e997210',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x05b4a7bf960bac46cc0c22aa6ee5b663a928787c9e7410fcf99e78182f634c0b'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x26f11691c7efea98db7eb7b4460cbc3f75db19772db2c2dbb8978979bcc5e388',
>>>>>>> 3ea5deef07 (feat: merge-train/fairies-v5 (#24470))
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x1f19b51af1356addc12d24893cfc16cfd421404dc5b04974da66fdb52d29a014'),
  MultiCallEntrypoint: Fr.fromString('0x05203392916398fe30a512b4c898c34a669c496ca6e1b11c035ea1b4396d06c1'),
  PublicChecks: Fr.fromString('0x0dd6de647dc6c8683810bc9f8d0f3be390e1ea8598fb48cf57923271804e7640'),
  HandshakeRegistry: Fr.fromString('0x1eae39549873f8b68b56defc54041d7120f14efaffecb6ae948a90fd43bb96a3'),
=======
  AuthRegistry: Fr.fromString('0x26418de27e7959352849f02436843dbdd033d69fa51a4bc8a60833c8b6fca502'),
  MultiCallEntrypoint: Fr.fromString('0x19770ce1522e502ad5bcbc28e4d4affe96d1eeed61f366c87bc1e7214e44a567'),
  PublicChecks: Fr.fromString('0x014a933a6759d143181575cf8bb9092f297ad9f6dceef20d5b0ba61369456a9b'),
  HandshakeRegistry: Fr.fromString('0x187a5ae492f5eaf202d69290eb70b1f07315160434ba816a1ce22627bad4b6a1'),
>>>>>>> 3ea5deef07 (feat: merge-train/fairies-v5 (#24470))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x2747dadb78ec93cd8980680c08160262c39f94e19852636a61804230d25ed110'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x047f02e6eee7a4454b8f0c6dcc1e89f72aa7f69ca4d5105fa079bf0cf50e764d'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1115b1305d75d45fd695da99b0b7478dd032af1167d15370ce5af8df74491886'),
=======
    artifactHash: Fr.fromString('0x1d2d505dc0a133d307dd6e121f9adda51718c5c61bf9239a277e3745897da935'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1516cf4369b08c199f52a71fa2205bd13c51a53759f4a96571c48310bf026592'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x04bdf54dbb0a90ccdd5659ad29b1b8206724e651c1d60f8046a0771496d26211'),
>>>>>>> 3ea5deef07 (feat: merge-train/fairies-v5 (#24470))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x0f54651be0d79bfd079eccd68fd6900656e5e1efa4dd30b1c95d801de5f9b882'),
    privateFunctionsRoot: Fr.fromString('0x2e2db5fb769f6c780e0dcdf9aaada9aae10c2561325809f6b616a268ef377511'),
=======
    artifactHash: Fr.fromString('0x1c4cdc2834480eed826aeece9b85ffb7bdfe751a01bc76220e3fa12527a9c932'),
    privateFunctionsRoot: Fr.fromString('0x02a4dba36389845b8ef0108562f7536d3284f07ca678558fc3c3bce3b24ee821'),
>>>>>>> 3ea5deef07 (feat: merge-train/fairies-v5 (#24470))
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
      vkHash: Fr.fromString('0x2979f430e7a6d4c2222a35a5e00f9c8c0e41c5ad9afa95d8d718f5c1f57ac4f2'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x1bc6ab9244a92fe2143e42a1856ea0b29415e0530eda89dd634a0b8630780593'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x25d87da668c7c52b9c521579f191bb02486b3598d1ec0063927d5c0af2608daf'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0b6bc06e863cea2e363de5ec4169c8065c27aa4a875cc5def0c913376fa4acf6'),
=======
      vkHash: Fr.fromString('0x0f59fe525df9ff4a400e33dec33fd1dc07e25d95f860734a35b909085cf07809'),
>>>>>>> 3ea5deef07 (feat: merge-train/fairies-v5 (#24470))
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1f04747f14e80766fc5f21879674dba7e8b5a7ec1ac5506d59252ad433b76f72'),
    },
  ],
};
