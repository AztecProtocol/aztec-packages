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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x00b6c13d47a52717bc54afe32169319be75fa5874cf6da3ba5691b0d5800e2fb'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x05dc8c4896e9171487c4d2566f6c7b1cab035334fbce5d745911806fe9f92cc8',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1c15687f7706028d89c219d7e97622eae4829cd1e5a3fdd50de6aa0b15882668'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0193c31bd24d0347aa9ed889cd6d304832988625c2f21c411e7af9d703591aa5',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2e3c56291b67be9bcce25d7ffaf09d6828bca2ffb651d50ac8505e8aa9b39e72'),
  MultiCallEntrypoint: Fr.fromString('0x24b4ed54a73cf8b4303ed86ad92a9f9b28df3479b3fd15ed3e099caac5caa4cf'),
  PublicChecks: Fr.fromString('0x133c6531200de40d85981548fde05b5b999e5ac941dcba03291953d91794bb72'),
  HandshakeRegistry: Fr.fromString('0x13d3abc9b8e4486e0176f1697c2fe95a8051b69c18e2dd5622bd632c3dffe32b'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0de7abf9ed74757128e3a64ccfc6affc7de5022eca7fd7cc8b038239ba4e39d6'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x053e2bab9e0893c010a42efb34755857f5f4d2129bd7b670a9f7f87030e6ef4e'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x20d3811f41dc9c2f4fec24ecfdddf724175d7ef52c176078328ba65671f6aaa7'),
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
