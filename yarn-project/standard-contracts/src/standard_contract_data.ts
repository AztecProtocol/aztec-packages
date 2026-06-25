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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2650f3b791a2054617c405fecb131c7663b67ea513bda91a56d9e2bbcfacbabe'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x28ebe472c778ddc3fa21c1a6bee7456e06f2e5dbde21094466f6426c6190ae84',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x19f5754582cfa9d5fb0a01642583334d386e873cb49ca36c1b2fb0fc27087129'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x24f20959654d5c2f46e493a52d1d7103d156b2bcb60e0814da1009d70672207e',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1b9d6b9c23ab942d58c7b330448a18387a6dbb3773bd9ea44e3090f276a2e828'),
  MultiCallEntrypoint: Fr.fromString('0x15b209d0fb8691c14950d11cb475dea86bfe363733e0b50715ba6f7091ac58a4'),
  PublicChecks: Fr.fromString('0x0d1943024be54a787298704b1031cf6af36278662dc679263aeb9d0eb8ea8dc1'),
  HandshakeRegistry: Fr.fromString('0x06a9f4e311c493882275cbd90e114a996657db896682fc85b04647923c70d1a5'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x03233975909c9cefa9cb69c6237f862f7e9c8f8f518a5406263f1644f1f9b6c2'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x21c18f9973dc9a28fb8243563efb08e3a4beffc91da0bcbdd5926894adbf001c'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x1f7f75a2ad4b49187087e9a0092de3f195bb1cfb283f287db3108781fa20ffb5'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x289b23ec6e3c097471913a8d8d0d18a47a4d112a092f5b013eefe52f9ac10d90'),
    privateFunctionsRoot: Fr.fromString('0x2e839c3fda7214a7ba230e564fe13c9bfed033132e731bf223321485f0b8068c'),
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
      vkHash: Fr.fromString('0x2bf48dfeb80efd1b12ca08992ed1f900938764b1cca4afb50aad54096485e7dc'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0eaa1eff3977b3636573dd23f2e32196b7b0f1b13b38d98e6c3c9b5774c40668'),
    },
  ],
};
