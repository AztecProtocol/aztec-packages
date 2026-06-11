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
  AuthRegistry: AztecAddress.fromString('0x172c0cfe054a65b800e5c95653a4197dab120b05a0b38787eb58f032f591777a'),
  MultiCallEntrypoint: AztecAddress.fromString('0x2c31ad6ca8cbe75504f9f939d2b450d775dfbc3697f8091cb0a58702a8ba9cc1'),
  PublicChecks: AztecAddress.fromString('0x106479f2993a73b878821b4cd0098c9bd48164b32e9b567df009732dabaa65e2'),
  HandshakeRegistry: AztecAddress.fromString('0x0ce4e7e47ee3960bcaf082a6474257c1c46e2fc0d37f7f4f60347c553df93e3e'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1be20e92d6a2347d4b2a5d09cf24ace953dfd56d6c8411cc2b90e67d5cbbdd0e'),
  MultiCallEntrypoint: Fr.fromString('0x1275ebe496f5577dad795f5f34d3917a19f3d9f8e865466f57c49dd91fd57236'),
  PublicChecks: Fr.fromString('0x24ce4becc7cb6bf880726dc4358b09ada12fb0f7015c32b971822033fc5844f2'),
  HandshakeRegistry: Fr.fromString('0x2b6200ffc25565b9a8a3c82e79f2c57b04f67b259d3b01b0a63133b6adf205bc'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x294cf57741ec175652921fd6fbd5ac8bcfe592ad761a5711b66a23b60ba8fbc0'),
    privateFunctionsRoot: Fr.fromString('0x0989ae5e82335b25c17bc4ff8a533bf53121df8086c60219036a3d5d2760dd07'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x16a1c11f78386c8e1ff3d413e05e068a81f88b2659b66b909f7215226553fa60'),
    privateFunctionsRoot: Fr.fromString('0x138aad15bdad626d627e129047ef7bec25abd0a3bfaab5578e981c00c144e452'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x12c44e639e8a6c994c94c913eaf37c7809b1d97ea30d2c527474b09d4367c87d'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x16dc423d685d565f0713936fa5acec94daefe82d92c4306354c4eec35ae8aca6'),
    privateFunctionsRoot: Fr.fromString('0x2c4027a6780d8eb1d06d83433c92ed854e36828fc82cb234d9745abdaca1204b'),
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
      vkHash: Fr.fromString('0x168709082df6a6bb40521eb8f100c77a297e4f06ae0cc012e2b4ea6236895a6d'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x2ea48304d9267aaf7ff2d4e072270ed13003b66d1fae57e20f6b7adac6466b53'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005d4db100'),
      ),
      vkHash: Fr.fromString('0x22266f7748df58465cc83cd0b7a182f08d8fbe8ca9242d6006a75cb9ae2cff0a'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x1a5d71a8854f68e70964a14c23c7e2cb90375080cce6b8b686c0607e03e080e0'),
    },
  ],
};
