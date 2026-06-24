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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x020a6b3d329d2904038a3e46fb24024487ec19bb5b8ebc9c8c024ed7be532a77'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2857aa116e7bab2e086ba7745838b596a91beb0347ede00406f845f56568e020',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x300d109ae1d6193a2e4054e3b54a507c20467bec551f205fcabf2098cba00af4'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x08112cdbb9286ad71c084784249cd7050b66a170774d1fdd815a085485b83ca1',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2853676e71bc23528ad53e039a8a476b2a64901b3314507b1c504d01712519dc'),
  MultiCallEntrypoint: Fr.fromString('0x000f28ba678c84cf8e815e9f271b4b46de9c1bdd278f6afabeae09e19c66e8f7'),
  PublicChecks: Fr.fromString('0x1b2f1573a518ffdc929aeff6b5ded41a74b8113f27aacd291def86fb252bcd4c'),
  HandshakeRegistry: Fr.fromString('0x2f26798bad7dfd02ae4facc413d18a182becaea4e1ee396523018fc257817baf'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x12d8891089e0e3cb20a4aa1649d869316749b2b966698388fad7432b7a7f3cc4'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x092ab6337312c853eca60a7df4ec09b0c2be5ca5073143bcb82bf8c7ca3044b2'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x09da1abc7ca16840cd49897d5930238050ec570b02029e72ea99c3e99f2a7e40'),
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
