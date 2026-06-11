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
  AuthRegistry: AztecAddress.fromString('0x05826614d651315387d64de606bbbde542386ea2fb63dda8b9a3b0c51e8b7166'),
  MultiCallEntrypoint: AztecAddress.fromString('0x0b6ae6676185f2a0c20323d91182fd5c9cd0abc7c178d79059f39e7930732260'),
  PublicChecks: AztecAddress.fromString('0x2f5e1e2b07b1fab93a0d8217643d988da90e12bd9c41a42265eabfe66c1824a8'),
<<<<<<< HEAD
  HandshakeRegistry: AztecAddress.fromString('0x045f88e9895d897d5020c30d0c44df48d79b27cc243de668541a97d6a3a0e498'),
=======
  HandshakeRegistry: AztecAddress.fromString('0x2491f3a3cdfb66c89b1ea0d1d96fde4ea3e64cd48f122b81efeebf7ec24ce24d'),
>>>>>>> 951b1fc149c (feat: merge-train/fairies-v5 (#23992))
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x11b7f7b87b1c0856e9da009c1429017731df8b02dee16c53f4aa2be137dfa957'),
  MultiCallEntrypoint: Fr.fromString('0x26a30a8e820ce3e53d55978c66a5c11b17fb1f8e4208379c01cf5e7c45908234'),
  PublicChecks: Fr.fromString('0x0642156526e3d53f5c83f9554ed147f5102e7ac87dead1bf835e4256bbbdec13'),
<<<<<<< HEAD
  HandshakeRegistry: Fr.fromString('0x13d189535aac09db68c0d48191bcf4c2a47d582b3724d54494522cd094bdf4aa'),
=======
  HandshakeRegistry: Fr.fromString('0x1de63eec38ce0ea399518ab624f0eaf9e0dc0ceb98a13acf3614b0682f126955'),
>>>>>>> 951b1fc149c (feat: merge-train/fairies-v5 (#23992))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x0facdf56a4510899147c19156828bbde06dc1bf27718d56103e72cbe3bd94fcb'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x2fddf3fdef8784e9a60f6d16b014530744485c04e0c3f857e00c7ba87193996a'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x0ecc1629b1851e48ef40757e6aa458cdacdb9d5bd585b046fe5f6a79edb439f7'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x20ee7d436798606fbdff6ed971e2dfd0d4eec1c4731aa1637944eb71c4f1aba9'),
    privateFunctionsRoot: Fr.fromString('0x0e587d80907a27ca7a37ccc0b44b05c0844f52340922dbf37d6731b57bff8893'),
=======
    artifactHash: Fr.fromString('0x2c24b71c2047a248a4906a1618503b73a77ab4a199e674515273bca67a2ae1d9'),
    privateFunctionsRoot: Fr.fromString('0x1ac8dab0c4d3d0b97f608db9f6552f827d6ef1dd514aaa95727f5753336e3fbf'),
>>>>>>> 951b1fc149c (feat: merge-train/fairies-v5 (#23992))
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x2ed309f7dc4cdbfda83dbcae2f9f30d42fc86079ad3541dde2ac43e6a9b9b7e8'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x14adfd42262e379c184abae1fd42007393a6a8710d60db23d9b82a75cd0914f1'),
    },
  ],
};
