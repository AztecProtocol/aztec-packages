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
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
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
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1662bedcee99614ec387e5184ad5b3027ee09fbe53227b52f400b145cdd0b6ae'),
    privateFunctionsRoot: Fr.fromString('0x0cf78fb872901f2883a6f9e940156658f5b317f4c437d80a67eb2a47d3bfc0c3'),
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
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005d4db100'),
      ),
      vkHash: Fr.fromString('0x035db3173b6dc6305d989fe910690cc0a556bf30261c6b4235144403e5378635'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x086f9209118872f060094869666a20edb9ad69272c3a1b12fc93dbe839d271c7'),
    },
  ],
};
