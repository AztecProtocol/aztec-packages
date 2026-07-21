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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1e8e7e73c592a1b1c9199b4b655ddc7a16fa8a8488df595610b71d3dc1cc666c'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x246d60af8b79a5dceece7d2388921203401c0df02ce674c5781c6c2162922986',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x031b75e2c220f6a6f27da5d61f7b2a12756a127fd25b95fad5da1c5520994b18'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x086c3c67589e1141c70ed0ed8ae324c51d3bf7c5637043fd84c424ffb625831d',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x04182c4b482c8e60c386e473f6dbb6bb3e2ef18e5156f7c9db5ac46af81abdcf'),
  MultiCallEntrypoint: Fr.fromString('0x2f20566eaff9091697f8f5c43a19041267c7591d54074b57043eae90fca8ea64'),
  PublicChecks: Fr.fromString('0x04bc93d415c4d48acab6063b6410f74e1cc257ba8e519020f8773b4ce8ccd31e'),
  HandshakeRegistry: Fr.fromString('0x020ec1998d06036ddab4ba170e9b0d9b96e52beb58aa5ea83d72b22f589cbe6c'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0f050d2517afac6974e02937314e095569f4c7bb70d98cea097c562313872c8c'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2c0df1970a0307e54c4445670a7f915a77ed57650ffd37a76c47e512c88e0302'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0e6f595db5f0830c2f52f1a5aec5cc85193b89a47408cfbbb2d6ad8f3a7c8a52'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2dd01b80cabc352f7d01799a6e5dd6255cc0d7f01fe42d270760d0bf0a0b5daf'),
    privateFunctionsRoot: Fr.fromString('0x0c80100ee31d91778c8f3d4453d056a58467b50f86d446f3209b96d87acb354e'),
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
      vkHash: Fr.fromString('0x2d46cdec4cc2afd813ba2b50106dba455821e4c7b3c10f1c7293bbc759dccf64'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0699bae67183ce084da1cd76ce05d18f45f796237f2baafaf7d4bfbf9663c433'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x033a99c31fd390e320398efa03eb1a34d0db2f2e0201fbb0062aa915f406f3d7'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x12964f25be85fded4079591a3871e85d15967c75fd70f3d0edf10d72abfea59c'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x049120d4c9a12a2286c83df31064637b53746ea13868b0756174dcb3e036bb9d'),
    },
  ],
};
