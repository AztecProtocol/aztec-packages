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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1fac45fcfd6b3ea0f9a08ea0c833bb30f72e4bc1398dcaed6a176b124d09bebe'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x02f751d8543db111568dec074586e6045fdedcc4863a12bcd99e0f9053f8c16f',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x285d49810d38a0cd0ed97e8fac7734d156f6a3fac0b8439df27c946a23e7cb1d'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x25593a91d44b50d05e66ff240a329625fb3583a51eeb0f83f071d7f7e8d4d28b',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0b8f38ac49d1cc7e52ccf3dd0cf13afd5bf8a75c3f4434f6ce03a95ee8cda50e'),
  MultiCallEntrypoint: Fr.fromString('0x15d01bc729fb617da8c3353f75e3bb6e7d82359fae85f60e58db8d5c7e25708d'),
  PublicChecks: Fr.fromString('0x18461e481c69f3f5ac49ca83987dfad07de2366d797a07132099ada8350f0240'),
  HandshakeRegistry: Fr.fromString('0x19e2949b861d6ca90020a7bb4675dd20c6d0908294174f9d2e2d7687d3177240'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x2c0113c0e705c5fda85733c09eb0a5896e9e193a1d6556125e06f7ffd78bb4ca'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1ae53e8f880a9a14cb0f800a33336d99bb6fdcebd58b58122f69268815dd4124'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x06087be6fa9ae9a4771d19c48a64067cc832e1a1c2bfa3425c77b6ec3fcc6064'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x294711bb2ef12f26c51f754db9111ff4a5ebd7171d42e7ba7c6b638a8b09b650'),
    privateFunctionsRoot: Fr.fromString('0x11a10bd77aa19bdb444e8488129db440f64e291ddf781052e298a593b4941de7'),
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
      vkHash: Fr.fromString('0x0557df5ba7ab8ecdcf13754da6cbedff4c0654d87a4138b6eabfebe414a7f35d'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1e4bc826140c11db39be74ec35c18cc8302b408691411b0d2576981bd80ef7d0'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1f04747f14e80766fc5f21879674dba7e8b5a7ec1ac5506d59252ad433b76f72'),
    },
  ],
};
