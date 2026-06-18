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
  AuthRegistry: AztecAddress.fromString('0x0aa7da8bcba8fe32d529a88b9ed88bbbd92bec786030bfe994069078a72c81f5'),
  MultiCallEntrypoint: AztecAddress.fromString('0x1fc54b9700679a1a646109cec4b80a20b8b8b51eb57c4b4f024d68d891459d09'),
  PublicChecks: AztecAddress.fromString('0x2841f0c768709c41248713f64fcce28dcdb31c75cc65d7144cfee81c31d6e82a'),
  HandshakeRegistry: AztecAddress.fromString('0x041b57f2e7316dff3b3b3aa5ec5f9cc781da576caf4b3779e92e8b273ded3d49'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x13042ef20d04be7c8dd0a73d0e223422f3f354971c90cbd531b60a452b6eec8a'),
  MultiCallEntrypoint: Fr.fromString('0x1a99b3c16d91abfbcd8180f2bb20ee50a28f70ad1387c9cdf0a2dfaf16556e72'),
  PublicChecks: Fr.fromString('0x197114e7c7faf9690c897705b1afffa0dc56373d64fe3cc2a1e74073b1e95a69'),
  HandshakeRegistry: Fr.fromString('0x13877d703cd5fe3f26eb26a3e4c8ef61c2783c5d2776df2515d6e255b978f681'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1c319bd046bbf2386f8f75dadf91c5cd1b0a6f7feac9637ed0a567f51f32ade2'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1999d4c4102d083917a16047bdffe2825f16f0ebf3af5dc1670de5abd85ff212'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2a6108541277cf042e4f1583bcc572a042c2327709460f8377fa55674ebc1754'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1a4e5dce4b9606d5cddf7ee264da2262223139ef9e98d042a806b282d7b4aca4'),
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
