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
  AuthRegistry: AztecAddress.fromString('0x2c3393337755db52cf1f18ebc61ff28c0c1e7cf12506cb5ed3676dc4709794e8'),
  MultiCallEntrypoint: AztecAddress.fromString('0x1a431070872f340441b736d1a23b78f7aa84f35a3c6a90a8fb6ec58855f8fe06'),
  PublicChecks: AztecAddress.fromString('0x1a19f689c95f22ac9adf9dfc3ba634802c038b094f27bbc482bdbf0d33e70740'),
  HandshakeRegistry: AztecAddress.fromString('0x0e35e4fefe6a93f01f02a368496781a7e42fca551c16c9e73c727cd9a8c02333'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x02611595f12f9fdbf0e522e97d8105db14fba648e35acbc655b355d264ee1e02'),
  MultiCallEntrypoint: Fr.fromString('0x044c6a14ee1a6069e5083627ecab023d34b1bb0f3a4a209eeb0cbee92138743c'),
  PublicChecks: Fr.fromString('0x19e57c5437552d2f4caab2ad18170ab0df293494e8aac182c2afc3283e9eabeb'),
  HandshakeRegistry: Fr.fromString('0x081e5370e2b9839659772484814963346cd495513932ffbc30d54459b050e040'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x256760c2b52314fb9f2597374e47e92920524c9602e4447c05cf78d512d81982'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x21412a6ddefb8693ec387cc77328b0f8d4533b906ca91863510c0f84f2a524bb'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2456d5ee2175bc8b061b85fd28fe89053c2d01cd0510237ce381e687a2299cf5'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x239536a22445ef2c8517dd1569dd6935f0397d987706c464807e570e43de63b2'),
    privateFunctionsRoot: Fr.fromString('0x11ce30d875b2dc0e96b9c336573709c65a2b693d137ae03b8d26b3e32381396e'),
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
      vkHash: Fr.fromString('0x07f07356e170eadf96b7a29dd1932d185f6c518906411a0428d1334e0a980c8d'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x2f13acc8def7a966c5cc4d95d70882034af3c2de72bf3b57c8d48f833fa750e0'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005d4db100'),
      ),
      vkHash: Fr.fromString('0x2ed309f7dc4cdbfda83dbcae2f9f30d42fc86079ad3541dde2ac43e6a9b9b7e8'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x0a8ed45e4a2a43d2143573f62b947f17ec03befe5628adb667f2199d2db9c274'),
    },
  ],
};
