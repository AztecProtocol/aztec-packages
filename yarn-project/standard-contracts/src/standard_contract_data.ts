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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0066965afd4772e6acb9e4e49db59d3b248f6ed1883ae566fd5d67b26369f99d'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x1611308f8227c755f7d899b2649292b2d22e79d052835f21eaac0034bcfdd4d5',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0ecf1b55cbe605a5c8babe1cec9ed9cc3756ea226606318a137c1240873de0b1'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1fb91bfcbb30060c3ded80d0afe2ecf5b0847417a291e1cbbf0d51ffb9eebd6c',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2ec57019ac5978ee769c6864eece7d9038c3895ceb2881f653f2f72ed770c96a'),
  MultiCallEntrypoint: Fr.fromString('0x1ea984cc0e2f8b7f23df40b24d0c6fe6648ba97962f0c4000095a73fdd92a703'),
  PublicChecks: Fr.fromString('0x06e1133f98fbb625866ce88ec40517f7faa95eafe509083373a5201538132e08'),
  HandshakeRegistry: Fr.fromString('0x2f375e6424fc997840fa691807dccc0164e0a0940240a70cc45b7a7bd25f62b5'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x193f8d6eb359386a88526e9de0fe1685b85f5f083e075759a7d555670b36ad11'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x03071f732833fceb53f2c3da00b9f5bc0715c94ff37b6e01c78619f63ce88858'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1cd917fe9b02a80acce1880672e0ddccce831ec2e96d9cdd03a4d416cc83abac'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x17ab203d89c6b6301da0171584bf2f7f24d87fd5ed7ff6b93bc9243847c1323c'),
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
