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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x1d08c0a3f762154331745eca76d336986a164c23e34b796a005a41a0b08a5e50'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x0863b2b91e0c1ffe6a7a36b815da1055cdf6db7eaa4f9a177f49504f09acbcfd',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2401f92eeb6639beee3e8950901fb10d9f1c8fc5144972a890e7d7c2fc6c0d6d'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x2d3a56f449481b8599c88aaaf79eab0417fdbba07eee66cbef09c6b834edfd1a',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x280cb5e3d305a399c1e1f7190e2c72520f3f291ab66d2bfb3245c991583c9ff5'),
  MultiCallEntrypoint: Fr.fromString('0x2000e440493e4a83b7d78f793ef0d576bdc0260190c3aa14041c07733915b968'),
  PublicChecks: Fr.fromString('0x1df508d5369baab49856cceee0d06612d0bc4959e79fe16a85dfa9f4c3fbd655'),
  HandshakeRegistry: Fr.fromString('0x2a1cd598dd9a51c3320701d19d880b87c20c5c9c735256b5a7803d305a8f9fcb'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x046db90806b708c7aa7db514233c0e176e256355db5b1e9d81d84fbeb10dcd9c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x009ed11ad9a0342f582b64971b7a1ec67020cd9035cee9523b7a64db013b95da'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x139c4d31dd30a67df7551b043abb9c6105d5f420b964ae6969e177adc31e947b'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x2a231c1ff071d8791858602ff3e6d199a1d48ddbc623e4cdd71d70b00d96dab9'),
    privateFunctionsRoot: Fr.fromString('0x02f6a2c3fc7b34bd7b389488370990421f16cfb177dee45c9128a412ab3b0bad'),
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
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x16a319171b8fd5ced714d45fa0edb4c90ab3f71dead8051d0bd0503f6a6a919b'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x0836a4aaa7592374f468a6f22a8b94fcf47b909df22f2ec927aed3dcb06c055c'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x2c2961a5e83daa909242c9ce441526c0a95379fda0976877acba4ffe7be949f3'),
    },
  ],
};
