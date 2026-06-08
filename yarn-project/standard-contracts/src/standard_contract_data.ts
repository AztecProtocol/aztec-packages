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
<<<<<<< HEAD
  AuthRegistry: AztecAddress.fromString('0x071ea4633c4ea9ef9a3b81f1e2863b0a49d8dc06564fa215701d99551e457e0e'),
  MultiCallEntrypoint: AztecAddress.fromString('0x2be6613abd23e376f5b9be0034bf2f0f58ee91422b521f1c4d39e4ffac045da9'),
  PublicChecks: AztecAddress.fromString('0x106479f2993a73b878821b4cd0098c9bd48164b32e9b567df009732dabaa65e2'),
  HandshakeRegistry: AztecAddress.fromString('0x23c295a1b12b8f4cab548704d37cff509165d991f05cc7a7f17539ebd5fbb606'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x084f5ae7076b9c2a092f05b0b7c21199a17d38830c84f7ba37e011428b9d4722'),
  MultiCallEntrypoint: Fr.fromString('0x014ca470c4137e0c374831c66336be6c59752e39f632f7d1e1dbaa8e04ea90be'),
  PublicChecks: Fr.fromString('0x24ce4becc7cb6bf880726dc4358b09ada12fb0f7015c32b971822033fc5844f2'),
  HandshakeRegistry: Fr.fromString('0x0d1b71a88eb40f9bfeb3d7a72fd2d0d9ba3e8f647b40450ac5a1cd116d44863f'),
=======
  AuthRegistry: AztecAddress.fromString('0x023cb6fed0ebb1235f1c2a6656c3b2438b84d24705a517211dc186db7d1ba754'),
  MultiCallEntrypoint: AztecAddress.fromString('0x27d70a9a022dcd1195a8d2a4a3a8c89b5af1d7831a68891d052af0125a1f1341'),
  PublicChecks: AztecAddress.fromString('0x2f5e1e2b07b1fab93a0d8217643d988da90e12bd9c41a42265eabfe66c1824a8'),
  HandshakeRegistry: AztecAddress.fromString('0x30280ec85136f131f9c34a9ac5c1390363c9207930c47eb93ddfd83f3601b5a1'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x0a2e03b7a5b45285478faf0981baafed6a2a23ef72f52cc9c7f44d3e5056e2fa'),
  MultiCallEntrypoint: Fr.fromString('0x0e6d4ba224e83a0883923cd280ceca43832cddb97496c3a81ea73c6833d9d52a'),
  PublicChecks: Fr.fromString('0x0642156526e3d53f5c83f9554ed147f5102e7ac87dead1bf835e4256bbbdec13'),
  HandshakeRegistry: Fr.fromString('0x17919296e72cb4fbd9a6c9d91b3cd4ffbd65b5893ca5f8e0d5147e37ceb97ce8'),
>>>>>>> b8ac769b12d (feat: merge-train/fairies-v5 (#23881))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x294cf57741ec175652921fd6fbd5ac8bcfe592ad761a5711b66a23b60ba8fbc0'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x16a1c11f78386c8e1ff3d413e05e068a81f88b2659b66b909f7215226553fa60'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x12c44e639e8a6c994c94c913eaf37c7809b1d97ea30d2c527474b09d4367c87d'),
=======
    artifactHash: Fr.fromString('0x0ba2481d3279c0dc1845c0474410833e44a14ea21ecaf7777c6d131d7a7af48e'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1e0e30618d0ebfd6e6b2572f7e8aacb0e3d56bdbfcc517335dd9709c7960177b'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0ecc1629b1851e48ef40757e6aa458cdacdb9d5bd585b046fe5f6a79edb439f7'),
>>>>>>> b8ac769b12d (feat: merge-train/fairies-v5 (#23881))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x16dc423d685d565f0713936fa5acec94daefe82d92c4306354c4eec35ae8aca6'),
    privateFunctionsRoot: Fr.fromString('0x11ce30d875b2dc0e96b9c336573709c65a2b693d137ae03b8d26b3e32381396e'),
=======
    artifactHash: Fr.fromString('0x1662bedcee99614ec387e5184ad5b3027ee09fbe53227b52f400b145cdd0b6ae'),
    privateFunctionsRoot: Fr.fromString('0x0cf78fb872901f2883a6f9e940156658f5b317f4c437d80a67eb2a47d3bfc0c3'),
>>>>>>> b8ac769b12d (feat: merge-train/fairies-v5 (#23881))
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
<<<<<<< HEAD
      vkHash: Fr.fromString('0x0a8ed45e4a2a43d2143573f62b947f17ec03befe5628adb667f2199d2db9c274'),
=======
      vkHash: Fr.fromString('0x086f9209118872f060094869666a20edb9ad69272c3a1b12fc93dbe839d271c7'),
>>>>>>> b8ac769b12d (feat: merge-train/fairies-v5 (#23881))
    },
  ],
};
