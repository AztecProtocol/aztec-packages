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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2569ee73b0a3c3389e5e3fe65f4270ca9a8f72f558b02a3900640fd97385ad0f'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x239810bd44cf7b3de73d0856309b6935d5ac56e1143e1fbc00689d712447cc62',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2570a715dfb01b4eccabd55264ac9b1f5eeae8abb481de71cec0a18e45d74ae4'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0193c31bd24d0347aa9ed889cd6d304832988625c2f21c411e7af9d703591aa5',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1c37c286f6b020b17dfd3b89a11a6982b08eda4b3abfb42d2f4a340861d0cd8a'),
  MultiCallEntrypoint: Fr.fromString('0x2a1aa136e793e3243d322f4ad81883fbf43946a73c7a15cee1cafa70fe099f16'),
  PublicChecks: Fr.fromString('0x1a2fe8b88cbecf39956d9a0d80b37083baf3c25f228c8b231e2c65b571d9f3c2'),
  HandshakeRegistry: Fr.fromString('0x13d3abc9b8e4486e0176f1697c2fe95a8051b69c18e2dd5622bd632c3dffe32b'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x22c9be71305b276fe067a365e82de86f239b9e37ae37b067dbc42730a770b0f5'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1237faf7f1ecbcb847433c53087951934491f57637e29917c8435b04ce8900a5'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x26448d3d954099d3d00cb5d7257853c9ede487ed726df87229ed40b844f98bf4'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x062da141c4114bcc93ac6cbe2fe30f0e8cbf820780b2225e958fe806d0e347a9'),
    privateFunctionsRoot: Fr.fromString('0x2fa128fc7f3b5aa6c4b9dc065f251c73bd947b65f2c00f784a68114de621228a'),
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
      vkHash: Fr.fromString('0x0357aa2db339c32ac5157260db378af0053d904960b764c85498547df9b94c90'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x00281e870a222de82b949de3d569793275c258a50b137f48b8f3c8982319b0e2'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x049120d4c9a12a2286c83df31064637b53746ea13868b0756174dcb3e036bb9d'),
    },
  ],
};
