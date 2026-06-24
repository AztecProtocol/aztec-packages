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
  AuthRegistry: AztecAddress.fromString('0x252146d8abf7761dccb866dfcdb49051841f808ba812b053b8b0dfbaec223bc8'),
  MultiCallEntrypoint: AztecAddress.fromString('0x08c5b4bc697fb1f1684ce111c84553a1aa602e7e20d89cc970e29ef5e21db6cc'),
  PublicChecks: AztecAddress.fromString('0x25b35f740243c7dd9e299845fadc33fb5850c7cf4461f3cc7afd99130e63bd61'),
  HandshakeRegistry: AztecAddress.fromString('0x2121aa94dcf47e0c246afc456a07523dfb3f7288ec1fde70873c359f7f4f1a22'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0c692e55bd6a17cfafd6166a70f826bcebc7ca1ecc6f9468f96df82b3b17a04d'),
  MultiCallEntrypoint: Fr.fromString('0x065ea39fb723fe8c92f48f4b9937d00ade911b4804bfcc7f096a6a1eb000d0d7'),
  PublicChecks: Fr.fromString('0x16dfff9f6d85b3e98610d1b4382e026483f60859b2e8cdcf0a13c2743087ec10'),
  HandshakeRegistry: Fr.fromString('0x0ff294d2a16f24f2ea90af87412d71a597f71ab51abbf05112a8c838b5f1aeb1'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x10262d7f81acc4d613c1d57782f3193aa4b2e43f53a1858def20baa8c2c93b5d'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x01cde9c10f4128cec195fa1a1c6e4030a74d9b49c747e1dc102423ceb3064c9b'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x04df83f4551896496fc4cac1fefbccea537dcc8d3265d0be26bb2d9979ec85fb'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x08a9ffedbabebebd4d04ab7f65ffcc754185fa350a16be88102eeb9efb480384'),
    privateFunctionsRoot: Fr.fromString('0x2443fe2618b0c345bb7629ee0775af69c6695a3eca6ebe1cd5d23617a00a5297'),
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
      vkHash: Fr.fromString('0x2d46cdec4cc2afd813ba2b50106dba455821e4c7b3c10f1c7293bbc759dccf64'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0699bae67183ce084da1cd76ce05d18f45f796237f2baafaf7d4bfbf9663c433'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x11d4d7327cb1cb71466ef6abd40aed3154227e730de34ff12527060056dff360'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x27bd4a07ac1e6385c3e35a83dfcf81512a947eceea024c603f62b9d26aba88f4'),
    },
  ],
};
