// GENERATED FILE - DO NOT EDIT. RUN `yarn generate` or `yarn generate:data`
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const standardContractNames = ['AuthRegistry', 'PublicChecks'] as const;

export type StandardContractName = (typeof standardContractNames)[number];

export const StandardContractSalt: Record<StandardContractName, Fr> = {
  AuthRegistry: new Fr(1),
  PublicChecks: new Fr(1),
};

export const StandardContractAddress: Record<StandardContractName, AztecAddress> = {
  AuthRegistry: AztecAddress.fromString('0x1bb959f23fd54e5d46a57d3d17fb711457afc5737aa1ab36ab9ceffd28167e23'),
  PublicChecks: AztecAddress.fromString('0x05d900a6ed1b4ad3ff52cbe5f98d9b291b0f35c6dd5c41b1642659344d234bfe'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x266929a160672851656769776c3c51836c63d19e4fc9cf7b8c3b7ab56c4a4228'),
  PublicChecks: Fr.fromString('0x022bbd3c085d6a09ec500110852441419c7b1e6dc21a8d459233b72a84d03a1f'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1bf78e923b58f3e083093a39ccfc37576b9089c439797365cc7fe3b73a000dbc'),
    privateFunctionsRoot: Fr.fromString('0x2fc3481324824686ab517de64d9c341d9112acf90741daf333e912c6c52551d3'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x030776b58475bf6a0545eaa4f4002f5fe6701bd0d306b68065f4b40ef4fdbe60'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
};

export const StandardContractInitializationHash: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  PublicChecks: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
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
      vkHash: Fr.fromString('0x04f85a712d004c406a245aa4a64894c9fbd3ab2d46324fbe14c25d9cf8ce21f4'),
    },
  ],
  PublicChecks: [],
};
