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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x00d6f5f367ac883ed8524f5230b83bdaa0bb4c334394884b4332a441b44f3b22'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x1dbc1e5c18fc301c3059d368230f1a3f7b867a53cccff4095a25e59c821fd103'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x11306cd94d75d32c1ea22b7abef4aa6af9a003fb727b22313b0f78c15264d726',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x13fc058a766630725790efb40acfcdf3eb52b005881a8ad4833cf64a9f4b7ba4'),
  MultiCallEntrypoint: Fr.fromString('0x0e8fd13d265d2cd222727d4742dca5777611f9c60558e0cd4c9a9916e20e55c4'),
  PublicChecks: Fr.fromString('0x305647009e9c55e4d0a86f4e20879e73e3744937d3bff786dad7cd38a33acde9'),
  HandshakeRegistry: Fr.fromString('0x1adbde91f20ee7d8edb50e52bb922d4522cc60e0b67c0ee1803175ac76a5812c'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1ee510811057eedd9c58c3795f893dd94b86018a10f6f46f30e04c1ed8156faa'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1ce946c89c743758091fe4bbd179650211db811e8e47be7b9fcd05e617ec2242'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2e39451f857ecaa3181a4a20a242677f9cfe99737cacbc02ec7bac677d145efd'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2315ccc6c1644e00a93ed55b65187a712548189acbbd7e7d5411d03dbdb3f36c'),
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
