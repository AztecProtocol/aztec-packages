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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1d57a9c5374e51195513bc1d1b40f4fcb70ab20a8f0a90955f9bdb7c558e6200'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x104ef9fb11bb6e701ca7b23fefa997b4ae4c35f82f86a1578c564679e70a4d45',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1d0f36676c5800cead9897333bd9bd610c06f76b69bd71f86b1e03b939c5752c'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x114ac462f0240d4aa248fe44132498e762238245a79ef3380fa40b9b13aba5ed',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1f19b51af1356addc12d24893cfc16cfd421404dc5b04974da66fdb52d29a014'),
  MultiCallEntrypoint: Fr.fromString('0x05203392916398fe30a512b4c898c34a669c496ca6e1b11c035ea1b4396d06c1'),
  PublicChecks: Fr.fromString('0x0dd6de647dc6c8683810bc9f8d0f3be390e1ea8598fb48cf57923271804e7640'),
  HandshakeRegistry: Fr.fromString('0x1eae39549873f8b68b56defc54041d7120f14efaffecb6ae948a90fd43bb96a3'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
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
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x0f54651be0d79bfd079eccd68fd6900656e5e1efa4dd30b1c95d801de5f9b882'),
    privateFunctionsRoot: Fr.fromString('0x2e2db5fb769f6c780e0dcdf9aaada9aae10c2561325809f6b616a268ef377511'),
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
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0b6bc06e863cea2e363de5ec4169c8065c27aa4a875cc5def0c913376fa4acf6'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1f04747f14e80766fc5f21879674dba7e8b5a7ec1ac5506d59252ad433b76f72'),
    },
  ],
};
