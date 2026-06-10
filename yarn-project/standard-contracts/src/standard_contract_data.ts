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
  AuthRegistry: AztecAddress.fromString('0x2bb3b7b36afa9087297c676f973f324ac47ea2f165e32fcd46490080a3fdf061'),
  MultiCallEntrypoint: AztecAddress.fromString('0x1d7af0b6888b47f5534a1c295e1d3be13cd8d022ec84e1113199e025449bc539'),
  PublicChecks: AztecAddress.fromString('0x2efce1dce5746a3051104659eb89919d850dee70204f8c7b23fa5e56e4a5c6d0'),
  HandshakeRegistry: AztecAddress.fromString('0x25bb587dbe1b04fa84bba0f452834c4459537b9a10641ef370c1927bf1c43094'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x07fd97a494889776e3fe467793324a0f593f5e8fa9e0ffeef0e192741f3daa9d'),
  MultiCallEntrypoint: Fr.fromString('0x0b8ae59aadab7fc99b4b317e424294a746c736246360eefe85f74aa55025276e'),
  PublicChecks: Fr.fromString('0x23bff3096ffb52def46fb95f06ad862a1798f75f580171d856827c8bdc796b9b'),
  HandshakeRegistry: Fr.fromString('0x2b8b2c779fa270354a9e8069be53880de188f5128f5df59bfd35ebee4044ab38'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x07a86a5dabaa267d42aa6864077cc5d44ca00db335e91d1d4a869c262345bc6e'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1d0ad0ed5ff7fd9ef726e652c040a13f725f7475d762f0643048ba0d627df3ec'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x04c879483f1509ff510211d2e7e5ff94bffb05add1f425a33a2a7faf8c50a26b'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x14815bc00215c21e2cbc8290aec557b92d05a38ab660094cc93153d25d04dbd6'),
    privateFunctionsRoot: Fr.fromString('0x0de4de94f6ec6d3aefc28afd86aee259ab8e36e2c394221632b34b091946d7cb'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x2f1c34c6e08be968dabafdba8ebe5300de23e682914b795368cde3d4a32b1088'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x1efc96ed0a270c9b2dd8a0c4ee308803985d6fad24fdd6822063207745385f78'),
    },
  ],
};
