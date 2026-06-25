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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x051808a630f7fdd5a0a2ec1dd49930ce8cec93d8461f29955ff3d94ca66f0651'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x079d9de7111fcddd5744541b717b7f3afe728272af71fe76a9ccab6b3122ce48',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x0be698e4a821fee5082dfcbbd89e606c68be30de3294a10e82043d3f952d5d51'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1b9a427a021501fa0c20a68a15f25e1585759df64c35f84faf23779574a3f912',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x17d4b33382b5bd68dc10bfe3f14f8fe2d93747a52e695107187c0890f9c50fd6'),
  MultiCallEntrypoint: Fr.fromString('0x1592122f743a58c2836eb2c801bcd87b27ed4cab239feceeef6c1721bf24d81f'),
  PublicChecks: Fr.fromString('0x06a0dceff508760584b3001324e0cdd6d8c41384100177365824c9b4e562e47b'),
  HandshakeRegistry: Fr.fromString('0x07e612b2f28c629e2ee124bc9daa253c9fdb0528e43ec7d07e00d342ae21c792'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0729f21c5bd948cc4da3bb3c60645a1839b0b6c00a5c5cd417fa86872aa49d6c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x24ea3a7d06408c72aeef62be899630833cf16708b3425719f864525034fe99f5'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x03e6afeb62375814bf4ced5b8c998195d9d7175310b8c6f2a537f542ba2ed301'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x0c0c44f326d345c7e71e17c62ce8324f02f9f410959b0809975754814bf76797'),
    privateFunctionsRoot: Fr.fromString('0x13c6ea42ad92702a4690fa562e8dc3eb0e1f6e23abe883a5246c7140d7acd153'),
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
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x17386be4ab92e7ac0c202d7027dc2424e6c35c06a9ac56e7bb01eb9dc9a2ef6c'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x187d0ad185898fc8d5c06e2fe5e26889b124fa307602f152b3af5cfd988b0602'),
    },
  ],
};
