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
  AuthRegistry: AztecAddress.fromString('0x0020b268573f6d5e54dee553dc68d4405da6c7e4221c5758e698d73e41196794'),
  MultiCallEntrypoint: AztecAddress.fromString('0x12510126063dddab16b44c68794335164972604594fa7bd0c3754b56cdae0299'),
  PublicChecks: AztecAddress.fromString('0x0557d1858ffad698951daa51f3605fd027eba6e7f94622ad24da05126e7f3f7e'),
  HandshakeRegistry: AztecAddress.fromString('0x23919b601b0281cc34e50ba15e3f475af5f5fdee8d733ce25009127419c9fbb2'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2d84e9669f9f1f6105c3d2ed3c08f90eb8abd0bff97d5f226539e0d76774a5cf'),
  MultiCallEntrypoint: Fr.fromString('0x2d2387eceba432573fd34dea58ed3a0a7af5a52b39ff04a87a0ece1d0f2a56b2'),
  PublicChecks: Fr.fromString('0x2b9ab6003a23d95febd02045d2b385bc5f80711d6e112ede46fc743705e61c6f'),
  HandshakeRegistry: Fr.fromString('0x211e7d5ba8ea3bb29a972c22ec24279a6316489da10f6c20bf5f436cfba26883'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0c786cfafaebfbd295c4cc47b6ca41ed0f1609b5727a62d89b4757603fe4a2f7'),
    privateFunctionsRoot: Fr.fromString('0x0989ae5e82335b25c17bc4ff8a533bf53121df8086c60219036a3d5d2760dd07'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2d84edf52e90359d8e16e63218e7318bedf1e5a692256c2964a9619a5775fc66'),
    privateFunctionsRoot: Fr.fromString('0x138aad15bdad626d627e129047ef7bec25abd0a3bfaab5578e981c00c144e452'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2eb2af286847562e97c5f45e98c0555ce816be008daa0f4bde8a7dffaf7725d2'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1a6c4c88f49165d5749ff369148e87b4abf7cf1dfe321f05bd9a61307c8ea505'),
    privateFunctionsRoot: Fr.fromString('0x1967e9ae7d6c11044f114ca12add689aa96011c31962542713c8a2f4138612f1'),
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
      vkHash: Fr.fromString('0x168709082df6a6bb40521eb8f100c77a297e4f06ae0cc012e2b4ea6236895a6d'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x2ea48304d9267aaf7ff2d4e072270ed13003b66d1fae57e20f6b7adac6466b53'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x22c6cbdc17799ee753bb096fc6cd9b5ae0ad3eda92901c665bdef0e39e6906e5'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x088074a8ce18ac0af93a65c4e0df484a03419c2ff846a8e66ab193f8abc7705a'),
    },
  ],
};
