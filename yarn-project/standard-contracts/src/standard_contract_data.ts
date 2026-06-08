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
  AuthRegistry: AztecAddress.fromString('0x27c3afb7f6f89a1a3d66ee190497ec3dbdc086c69c34dd1ee4a693ac015562fe'),
  PublicChecks: AztecAddress.fromString('0x05d900a6ed1b4ad3ff52cbe5f98d9b291b0f35c6dd5c41b1642659344d234bfe'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x1057091e5d84f19cb96aebf80aad91e4b502d5e67201b74c0ccd39e36581d198'),
  PublicChecks: Fr.fromString('0x022bbd3c085d6a09ec500110852441419c7b1e6dc21a8d459233b72a84d03a1f'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1bf78e923b58f3e083093a39ccfc37576b9089c439797365cc7fe3b73a000dbc'),
    privateFunctionsRoot: Fr.fromString('0x0989ae5e82335b25c17bc4ff8a533bf53121df8086c60219036a3d5d2760dd07'),
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
      vkHash: Fr.fromString('0x168709082df6a6bb40521eb8f100c77a297e4f06ae0cc012e2b4ea6236895a6d'),
    },
  ],
  PublicChecks: [],
};
