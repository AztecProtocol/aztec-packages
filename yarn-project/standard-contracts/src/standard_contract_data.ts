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
  AuthRegistry: AztecAddress.fromString('0x236b61c256d79144d97949d725cc5f5c4e63eff7770f1928cf0bef02b95dc3d2'),
  MultiCallEntrypoint: AztecAddress.fromString('0x0424a76e21cc54c689c612c900a3cd567dc4018b33466d03d44127d04edcd814'),
  PublicChecks: AztecAddress.fromString('0x16252ea26eb7ded87236175c329f61d5b28eb8c5c7a634e674cd22361399d25a'),
  HandshakeRegistry: AztecAddress.fromString('0x1a061d2167e5899d90c9b96e5b91b84f2e463a2cd47d940b6eaaa64177052c77'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x02656358f7a1ffd0ffaa1de73c99775039a83d94e2469d94470e778c53525756'),
  MultiCallEntrypoint: Fr.fromString('0x1f404c2bfbcfc62e1556807fe4e2684a790334b835279fe9298e5eb5bca09f1a'),
  PublicChecks: Fr.fromString('0x02122dc276e1726bcae67c209ef234ff6354ce8ce117e1bed5cb12ea02f5c15a'),
  HandshakeRegistry: Fr.fromString('0x02fb8ff02a365564d1451869874fa998a6a59c30b95f712ee5938bdaa20ae3ba'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x094484479ace3f01cea15fe397e5a1a5224d549496ac1192b59270b6e0a38e47'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2c54e94b8ed4b8c417b780b5038a9ce9a8f0ab8116a46be68e7392f0a747ab11'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x040cf4e5ea8d340bf2a7cb296eab6f864877f27e7249509b2f2ad70d2458e8a9'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x08a9ffedbabebebd4d04ab7f65ffcc754185fa350a16be88102eeb9efb480384'),
    privateFunctionsRoot: Fr.fromString('0x050b16d41aa1bf4d0ba23b090aeabf3a35c6eaa6e463f4d96084242dcab12980'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x28a792041fa1c4b6695e3da6c1e2f83888bb8fee33b2436d35b7f5ce5ef34083'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x0dcfb09e1169c128d4194b3ce40c4e0a1f60ba9f54659f0c81890363e28124cb'),
    },
  ],
};
