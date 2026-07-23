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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1fe01dde371ec27308a4e5d1f08d2e734b773352c1f47d9d5b0974c1729ac16e'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x124b09dd9229a0e476e5d5affcbd917c16400d7673a6b589497650afc18456da',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0de6d5fa41576a2289a289180c5ba3b1b75d19a630c779cfbef4480e27ac3e28'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1f81756ef59026857b437350d1123ea317cacf3a20b95c77586d618591b8bb93',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x07429c3c22c191987452fe7c8daeb56b8a4ada6d94fed30e7fb6659da36c5099'),
  MultiCallEntrypoint: Fr.fromString('0x28aa32d375f8c4acb57cf9ee899bd3b08a5a148cecf2064602fe818aafdf6e33'),
  PublicChecks: Fr.fromString('0x0ac1bd3e46990fdcd9c4182ca9dab6d9b22dda5ee1a9fe581dde36a6ea639596'),
  HandshakeRegistry: Fr.fromString('0x1544fd83a3880eca21d17789665e5281318ea4f9395aef53217463deb5b82619'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0d029bbbf1f83e4c8c088213c7b7d200d2e89d2085183f53151d59ba369e1fab'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x28f8874c4768c1072922ca41c49ba1f302aefb7f858ebb289dc17c993abc8528'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1149d0cd4421cb20fccdcf2c73c79df4e773e30f6c4b8d24e8c1cd718d34d50b'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1c02c2ba7d53ec4fd5450d6dc7f86ab1b17a6fcfa5a50850405e7529acc9638b'),
    privateFunctionsRoot: Fr.fromString('0x10288478f6ce295fa9a831e0b712773f4c59287a6bc6ae57b5948519b94f7171'),
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
      vkHash: Fr.fromString('0x136fb94bf8b1bfdb25f4d6c6ced06b8db140a268330308027b32ced3151faa81'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x06bfb80a0e8d1c8f941c7f91c233e56febcb60300c4dcbf878df87120aa9a89f'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x05eef6388f1678ef7a24ed7829a15abf8fb76922ed73477114ff4828e2772535'),
    },
  ],
};
