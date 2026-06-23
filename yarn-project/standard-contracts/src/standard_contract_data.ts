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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x04fc897b6deff5e3c18900a6a1c8ad601772027a500b8f329083810b7bffaf26'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x1aaa6153c0d5780188c64dd4d2c28372d42e5bcee5210c4184a312db0fe709d0',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1da099c6dff135d8e519a4e973f27c0e25cf0897d7cf968c7d38329f46df1056'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x08112cdbb9286ad71c084784249cd7050b66a170774d1fdd815a085485b83ca1',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1034dc7a2f6e79bc30624e31aa1bcbfbf7771dcb18b1ce15996bf2ec8486ed34'),
  MultiCallEntrypoint: Fr.fromString('0x0c631fbcc97778edadd2cc20bc42a7f849a1933d363d93106a3a655856286f31'),
  PublicChecks: Fr.fromString('0x22c35afeea9f8bfc36b0fc9ba78bdd92769fd42f3926822cf85d4b0596e00999'),
  HandshakeRegistry: Fr.fromString('0x2f26798bad7dfd02ae4facc413d18a182becaea4e1ee396523018fc257817baf'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x05c4f994f0dd2b9e03b57781ec0d651a79cc657a24786673a757c76d62f31598'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2bb5473f1f2f29e39e85439dff7e5dbf727c4d840640c21a6009bf25626e0dae'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2c439427c5bde0db108e859d0a0602f1feffae12e7250193b5ffe0a9442a9790'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x23a22700ce485c367fd16a767c25d0e317dcdbbfc99c7d4b62d39f5f0032e74b'),
    privateFunctionsRoot: Fr.fromString('0x0763f8081167e5809885f2c7fe20da77a24070711177783d332eed1abb6a05c6'),
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
      vkHash: Fr.fromString('0x06a5c1b3a636c954a90be43cb56a4bdd9dc8aec764151a012e0018753694ff54'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0b19b2f937f2581922c2ead5411ad9ff4ed9710efe9849bde494d9a0f94812ec'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000d12ace81'),
      ),
      vkHash: Fr.fromString('0x0ed5d59a2bc1e5e2f101128b23e9b9498da46c9d782ba92c8189a58daaa76ef2'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1945c32345be651c37ad424f1ddb7eaf88703521d8aadebb0805b0383fe3aeac'),
    },
  ],
};
