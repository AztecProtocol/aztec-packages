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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x04fe1d86b5ae0f926883c34905a3c25cb30924138823a9883e2813d4f8b86ad9'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x21d17a596e8ae64c399cc7bffaf3f0346ae067a34948510f041dff8babed9e9a',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2f96c5a68fc1d04b13b76167a254f0a1a906c2dc0b571fcbca107254f064b045'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x090d0f9525c99184e3741290b2695c5e3af23f51e96061b74b953111b0d4f59d',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1d203dfe82143b105c236b42c42ede91728d4590e7c541f7d2423edeb68c31ae'),
  MultiCallEntrypoint: Fr.fromString('0x127ebfb260048794535198012df8e2f7599a46651efbf738c406f4baa3b960ca'),
  PublicChecks: Fr.fromString('0x087cada0973aa4e162f0830a61aed5a3f03d1e9578ce953aba213f2508d579a7'),
  HandshakeRegistry: Fr.fromString('0x041a88db4c2b65a224ad9c9d96c8365d972a98f47e2549a1841ac9897b8b7dc0'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
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
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x062da141c4114bcc93ac6cbe2fe30f0e8cbf820780b2225e958fe806d0e347a9'),
    privateFunctionsRoot: Fr.fromString('0x16c4666c93705b44b4a164ec6bcbfd7ec0ff593922f4a0e3bc158b9e3a1f95c1'),
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
      vkHash: Fr.fromString('0x0f230529c03e4877eeabfc0c659a1133e53f2d954b1d0f6092558cb02952da3e'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x2aa20cf767e6af6f99f4ceedcbdda34c2cd8a8e0763fb273810cf5abd7873b70'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x05eef6388f1678ef7a24ed7829a15abf8fb76922ed73477114ff4828e2772535'),
    },
  ],
};
