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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x186fbbe15f50d01d67c471d5ed8b8be43b8826e77147cb0084302804e336e5d2'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x10a91e72a359e7441d4af9e418f14862abe994348970909d484ff2dad1594a58',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1f6f565db58df81c2bbb8e9932fa92d2d1f537887a06e2cb965184f77a5235d2'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x18233660a8797d74f63318c4223332e23b63f570da11fb142993ebc802a96728',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1684ac4f8c250f8ecc1c7629a344fa36002f5130d3b1bbe6e2c0e73e14640f0a'),
  MultiCallEntrypoint: Fr.fromString('0x003a615f16c5401ef184876baf2aa54f67ff693672a03134cc8920cfb58957c7'),
  PublicChecks: Fr.fromString('0x086e79a9008498c03a83dd1e9b69b6cbe8d1fafe31b2a775d0b6610dac7d681c'),
  HandshakeRegistry: Fr.fromString('0x1007fb490420810f54215128260e808c7ab2b1dc4c1801156833d4720696bf31'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x175607a9b31428948f4041db7d4e1667492292fb7850f8138c1d3cf5ffde8b34'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x23af448187164c7d5e6f392346958e688690370515359de8909f3f05f2e26760'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2f3869d9d89bf7b428da7f8c620aea11acc022cc0c7222544cc841e5ceedd8dc'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x080bd5c37240f9425fea5c87b844a67ffda312dbf58c58288b7ba6b4d5db7663'),
    privateFunctionsRoot: Fr.fromString('0x14fed008fa16ae6e45b7561aa0101d0d97953e2fd86caf7aaa603f14807797a8'),
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
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x238417677997f9e919cd828f7bd156701e447f3d7c8881586f2277df607036d5'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x12f43f384aa64661b012b52b1d80eb1d2202b8e459b50f56cfe270b0672c16ff'),
    },
  ],
};
