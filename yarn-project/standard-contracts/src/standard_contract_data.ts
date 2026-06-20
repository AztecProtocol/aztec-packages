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
=======
  AuthRegistry: AztecAddress.fromString('0x2df3bf0052304b37c59cfdb79eeeab7f05f8b1e197293e456dc9c7716e6fc654'),
  MultiCallEntrypoint: AztecAddress.fromString('0x099e0fdbd90bed29103c75ae755dc43dc06e53c845dd25cf81ec05570a68c2fb'),
  PublicChecks: AztecAddress.fromString('0x2da605de400a83f4c1750fdd1dba3a4b2977884a95549efd06f7a62ef6ae69c3'),
  HandshakeRegistry: AztecAddress.fromString('0x19fca351f28a726da8bd3c66c10f22314bbe6359a61440efbbc0721e019167ef'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1e68edd1786a3a9ef773ad5e481fee8b829bf92a2119204087df62af2f01359e'),
  MultiCallEntrypoint: Fr.fromString('0x2c613ebbf351bf6b493ef7d089edf2c8b8365677a109ff900695c5693e18e2e8'),
  PublicChecks: Fr.fromString('0x140586e8046f3c579bc34d660079204656126e3aaa219a323dcf487d095feb25'),
  HandshakeRegistry: Fr.fromString('0x25388ee6f42d552caa5f96df8be2d7ec313aea2dda20cf924048d2e942f43e71'),
>>>>>>> 4df72438bf (feat: merge-train/fairies-v5 (#24206))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
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
=======
    artifactHash: Fr.fromString('0x04124f7c586b2537ade4e6411412bbecce96b1e1eb638c0bfd0499e39ddfc507'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2401384960d38f4fded6a6cb494d583c7c5dfb893529aa3529e46cff20497987'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0dff0f7b848e225b89854cfb56bb5dcad68fa1edab5aa70cb08ec7853c438b10'),
>>>>>>> 4df72438bf (feat: merge-train/fairies-v5 (#24206))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x08a9ffedbabebebd4d04ab7f65ffcc754185fa350a16be88102eeb9efb480384'),
    privateFunctionsRoot: Fr.fromString('0x050b16d41aa1bf4d0ba23b090aeabf3a35c6eaa6e463f4d96084242dcab12980'),
=======
    artifactHash: Fr.fromString('0x2dbd127b85e874eef3dba3ccf23b3407d5e225ec051c3f8c0499a7edd3371f0f'),
    privateFunctionsRoot: Fr.fromString('0x0de4de94f6ec6d3aefc28afd86aee259ab8e36e2c394221632b34b091946d7cb'),
>>>>>>> 4df72438bf (feat: merge-train/fairies-v5 (#24206))
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
<<<<<<< HEAD
      vkHash: Fr.fromString('0x28a792041fa1c4b6695e3da6c1e2f83888bb8fee33b2436d35b7f5ce5ef34083'),
=======
      vkHash: Fr.fromString('0x2f1c34c6e08be968dabafdba8ebe5300de23e682914b795368cde3d4a32b1088'),
>>>>>>> 4df72438bf (feat: merge-train/fairies-v5 (#24206))
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0dcfb09e1169c128d4194b3ce40c4e0a1f60ba9f54659f0c81890363e28124cb'),
=======
      vkHash: Fr.fromString('0x1efc96ed0a270c9b2dd8a0c4ee308803985d6fad24fdd6822063207745385f78'),
>>>>>>> 4df72438bf (feat: merge-train/fairies-v5 (#24206))
    },
  ],
};
