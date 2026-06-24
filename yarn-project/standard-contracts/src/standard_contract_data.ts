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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0b720766c4e9b131677f2f1ebc7d24d7d9920817aca9cc2096449d1f4e402519'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x2d36181eb546630adce36ee63d433e572b6489c9b529abd7d02a0fc5024fa485',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x07dc17481fc391774ef06da49bd0a5e686fa57ceb01acf5bea77b68263dca2e8'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x01b7f365a1b4be01d1beae5c8b0367c146850844e86a07a0a13b851931ec311b',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x26ff789f850a65b0def398a5e8f98d1cba8fca37e53e22adaa4746486ed845da'),
  MultiCallEntrypoint: Fr.fromString('0x1fa58805631211a120053ef03e04252141202fb636252b9a62ca5e9a18a27d47'),
  PublicChecks: Fr.fromString('0x168d69e3c781af13d91ef67f16fdb061ae3a12a23fdc790c42c712f8f5989646'),
  HandshakeRegistry: Fr.fromString('0x1b9fa3376e6ad59dfd2c5cbca34dedb6d45b3390dbe46d6dae91a0583e197110'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x1765df0c839cefec14ee468a3c7f7be32f16d70c5f09442e82ed9b9672bd5a33'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1dc17e09c1b5f9e4f4f64b5238b1ec28f86e2e3f92c6650545fc4709b5df6fff'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2eeffb8a08743119318672a281fedc1b0764c65d2eccb6afd6d09664452836a3'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x297480c195ed8aa5a9057d8c6075fc8da61b82211523895fc23d9396e03e9020'),
    privateFunctionsRoot: Fr.fromString('0x0fc8be0f7959b08b523b864fc590b1fa1e7a20c26e22e8a1f3326ae74df24608'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000004dba89fa'),
      ),
      vkHash: Fr.fromString('0x1b01579dadd8a590ba9ad78b2afb9f485b1fb23125a732e06f8d15902267949b'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1945c32345be651c37ad424f1ddb7eaf88703521d8aadebb0805b0383fe3aeac'),
    },
  ],
};
