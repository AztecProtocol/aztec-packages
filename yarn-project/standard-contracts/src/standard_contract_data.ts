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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x04fe1d86b5ae0f926883c34905a3c25cb30924138823a9883e2813d4f8b86ad9'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x21d17a596e8ae64c399cc7bffaf3f0346ae067a34948510f041dff8babed9e9a',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2f96c5a68fc1d04b13b76167a254f0a1a906c2dc0b571fcbca107254f064b045'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x090d0f9525c99184e3741290b2695c5e3af23f51e96061b74b953111b0d4f59d',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2928fe638695f9566ae51434cbc621d3264d19fe2c925c43b0fc6cd413f531bf'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x29a301a7ce7166500f5e765dc5731df28bd22ef0aa49697d759313f1e506825d',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x277e4c930eb878c1eaede8d81dd35439bb8a34808d20ea84feb9e27eba3ea9ba'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x01a3dddd771199abee0f8f0d2eea60dd1ee6b9cf9e99f524600854628ddb2463',
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x1d203dfe82143b105c236b42c42ede91728d4590e7c541f7d2423edeb68c31ae'),
  MultiCallEntrypoint: Fr.fromString('0x127ebfb260048794535198012df8e2f7599a46651efbf738c406f4baa3b960ca'),
  PublicChecks: Fr.fromString('0x087cada0973aa4e162f0830a61aed5a3f03d1e9578ce953aba213f2508d579a7'),
  HandshakeRegistry: Fr.fromString('0x041a88db4c2b65a224ad9c9d96c8365d972a98f47e2549a1841ac9897b8b7dc0'),
=======
  AuthRegistry: Fr.fromString('0x01157b519ba7a95b98edccb6c4976b4414003f0ee4664b2b458f96b566130922'),
  MultiCallEntrypoint: Fr.fromString('0x21f59e0bd675d2373a31c00178f8f88850d371f93a2eaf9ca8b964395aa2c648'),
  PublicChecks: Fr.fromString('0x2a022a2e70ae7fbba7f33c9b80df8ba8f411bcd4af0797c30fa05792f94ed351'),
  HandshakeRegistry: Fr.fromString('0x1de87ccb3f4782ec688754b1cce93033224186730f12aba1880750ac1463e934'),
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x2ebd3d6e0f9d8adc9dc0e7380d8cad794ee605f53223abbe436aaf58e5920a60'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x3024d0152d222f9be0e5248e3cd2596217946bf32cb798f10d3e3f2480ac261f'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0c2fe9905f4bb8c1e30daaa23836b88d2abcca5e9332e8d916a36b04548752b0'),
=======
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
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x062da141c4114bcc93ac6cbe2fe30f0e8cbf820780b2225e958fe806d0e347a9'),
    privateFunctionsRoot: Fr.fromString('0x16c4666c93705b44b4a164ec6bcbfd7ec0ff593922f4a0e3bc158b9e3a1f95c1'),
=======
    artifactHash: Fr.fromString('0x1745d0f3d0477837f5647ad926fc6978dd22dd2b4655f975b2d799a5b02d5f8f'),
    privateFunctionsRoot: Fr.fromString('0x02f6a2c3fc7b34bd7b389488370990421f16cfb177dee45c9128a412ab3b0bad'),
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
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
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0f230529c03e4877eeabfc0c659a1133e53f2d954b1d0f6092558cb02952da3e'),
=======
      vkHash: Fr.fromString('0x16a319171b8fd5ced714d45fa0edb4c90ab3f71dead8051d0bd0503f6a6a919b'),
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x2aa20cf767e6af6f99f4ceedcbdda34c2cd8a8e0763fb273810cf5abd7873b70'),
=======
      vkHash: Fr.fromString('0x0836a4aaa7592374f468a6f22a8b94fcf47b909df22f2ec927aed3dcb06c055c'),
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x05eef6388f1678ef7a24ed7829a15abf8fb76922ed73477114ff4828e2772535'),
    },
  ],
};
