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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x11805422622ab58e3182d0ee45cfb48072dca4a5159d1e61004a91c4a21e07b8'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x0d53db1b5959ba8a806d207085a2b3b4411ce92a36db89e907b4899e94ef31a7',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0e41df3841dc204e91d8335681c38fccf487d9c80655dc0ada3492be1583ab4d'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x0d053a202d7b8a534fd077c0d60d1641a7030dd77cc60c4cf655b45f03146195',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1fc162652f774934bf324bb7446d401a44bf0e566ffe1d7fb23b8b0efd46c87a'),
  MultiCallEntrypoint: Fr.fromString('0x10251df11fe95419ba2b4a5cf3cc6583956cef4b63986c9d85aa14bf18c89f6a'),
  PublicChecks: Fr.fromString('0x0a07598b6b9f493f1f02ccbce1ea187c72e2c8e9e9e8e8cf476ce52f5941dcfc'),
  HandshakeRegistry: Fr.fromString('0x2ed497bdd68ad144fbee342a945a4ffe6a92e8cbb289fcaf8bf9fa760ce1585c'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x227ade1427c79598b6af776f869648072a3b5d731fdacb5495c7945ae92be252'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x24bbc9c9c704d22ee02cd81680f80335172f9844dcb58ce67f5ef42a15c376b7'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0b09f534e2b2863b4376d51cce2260ed15d7b723423292375fbd5fab08d4abfb'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2a346f9051f5095fa27c44d2d796d8ce9d03b4865deb95fd1ef467eae1ae08e6'),
    privateFunctionsRoot: Fr.fromString('0x02f6a2c3fc7b34bd7b389488370990421f16cfb177dee45c9128a412ab3b0bad'),
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
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x16a319171b8fd5ced714d45fa0edb4c90ab3f71dead8051d0bd0503f6a6a919b'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0836a4aaa7592374f468a6f22a8b94fcf47b909df22f2ec927aed3dcb06c055c'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x2c2961a5e83daa909242c9ce441526c0a95379fda0976877acba4ffe7be949f3'),
    },
  ],
};
