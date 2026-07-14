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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2928fe638695f9566ae51434cbc621d3264d19fe2c925c43b0fc6cd413f531bf'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x29a301a7ce7166500f5e765dc5731df28bd22ef0aa49697d759313f1e506825d',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x277e4c930eb878c1eaede8d81dd35439bb8a34808d20ea84feb9e27eba3ea9ba'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x01a3dddd771199abee0f8f0d2eea60dd1ee6b9cf9e99f524600854628ddb2463',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x00b6c13d47a52717bc54afe32169319be75fa5874cf6da3ba5691b0d5800e2fb'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x05dc8c4896e9171487c4d2566f6c7b1cab035334fbce5d745911806fe9f92cc8',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1c15687f7706028d89c219d7e97622eae4829cd1e5a3fdd50de6aa0b15882668'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0193c31bd24d0347aa9ed889cd6d304832988625c2f21c411e7af9d703591aa5',
>>>>>>> origin/v5
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x01157b519ba7a95b98edccb6c4976b4414003f0ee4664b2b458f96b566130922'),
  MultiCallEntrypoint: Fr.fromString('0x21f59e0bd675d2373a31c00178f8f88850d371f93a2eaf9ca8b964395aa2c648'),
  PublicChecks: Fr.fromString('0x2a022a2e70ae7fbba7f33c9b80df8ba8f411bcd4af0797c30fa05792f94ed351'),
  HandshakeRegistry: Fr.fromString('0x1de87ccb3f4782ec688754b1cce93033224186730f12aba1880750ac1463e934'),
=======
  AuthRegistry: Fr.fromString('0x2e3c56291b67be9bcce25d7ffaf09d6828bca2ffb651d50ac8505e8aa9b39e72'),
  MultiCallEntrypoint: Fr.fromString('0x24b4ed54a73cf8b4303ed86ad92a9f9b28df3479b3fd15ed3e099caac5caa4cf'),
  PublicChecks: Fr.fromString('0x133c6531200de40d85981548fde05b5b999e5ac941dcba03291953d91794bb72'),
  HandshakeRegistry: Fr.fromString('0x13d3abc9b8e4486e0176f1697c2fe95a8051b69c18e2dd5622bd632c3dffe32b'),
>>>>>>> origin/v5
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x21b25e8c4129d184560f884cef1eaceee92a7609407f2e4e9813eaf7eff8ec2c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1cd0159647dd761fdf5ad8452fad1a2197d97bf0a404f92f4144b2445b606121'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x12ca7f54baa716b053887e59f33b8df44f6b1f771aa8913cea9028aef6cdb44d'),
=======
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
>>>>>>> origin/v5
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x1745d0f3d0477837f5647ad926fc6978dd22dd2b4655f975b2d799a5b02d5f8f'),
    privateFunctionsRoot: Fr.fromString('0x02f6a2c3fc7b34bd7b389488370990421f16cfb177dee45c9128a412ab3b0bad'),
=======
    artifactHash: Fr.fromString('0x062da141c4114bcc93ac6cbe2fe30f0e8cbf820780b2225e958fe806d0e347a9'),
    privateFunctionsRoot: Fr.fromString('0x2fa128fc7f3b5aa6c4b9dc065f251c73bd947b65f2c00f784a68114de621228a'),
>>>>>>> origin/v5
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
<<<<<<< HEAD
      vkHash: Fr.fromString('0x16a319171b8fd5ced714d45fa0edb4c90ab3f71dead8051d0bd0503f6a6a919b'),
=======
      vkHash: Fr.fromString('0x0357aa2db339c32ac5157260db378af0053d904960b764c85498547df9b94c90'),
>>>>>>> origin/v5
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0836a4aaa7592374f468a6f22a8b94fcf47b909df22f2ec927aed3dcb06c055c'),
=======
      vkHash: Fr.fromString('0x00281e870a222de82b949de3d569793275c258a50b137f48b8f3c8982319b0e2'),
>>>>>>> origin/v5
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x049120d4c9a12a2286c83df31064637b53746ea13868b0756174dcb3e036bb9d'),
    },
  ],
};
