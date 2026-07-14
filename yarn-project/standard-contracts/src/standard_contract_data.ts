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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x2928fe638695f9566ae51434cbc621d3264d19fe2c925c43b0fc6cd413f531bf'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x29a301a7ce7166500f5e765dc5731df28bd22ef0aa49697d759313f1e506825d',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x277e4c930eb878c1eaede8d81dd35439bb8a34808d20ea84feb9e27eba3ea9ba'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x01a3dddd771199abee0f8f0d2eea60dd1ee6b9cf9e99f524600854628ddb2463',
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x01157b519ba7a95b98edccb6c4976b4414003f0ee4664b2b458f96b566130922'),
  MultiCallEntrypoint: Fr.fromString('0x21f59e0bd675d2373a31c00178f8f88850d371f93a2eaf9ca8b964395aa2c648'),
  PublicChecks: Fr.fromString('0x2a022a2e70ae7fbba7f33c9b80df8ba8f411bcd4af0797c30fa05792f94ed351'),
  HandshakeRegistry: Fr.fromString('0x1de87ccb3f4782ec688754b1cce93033224186730f12aba1880750ac1463e934'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x21b25e8c4129d184560f884cef1eaceee92a7609407f2e4e9813eaf7eff8ec2c'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1cd0159647dd761fdf5ad8452fad1a2197d97bf0a404f92f4144b2445b606121'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x12ca7f54baa716b053887e59f33b8df44f6b1f771aa8913cea9028aef6cdb44d'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1745d0f3d0477837f5647ad926fc6978dd22dd2b4655f975b2d799a5b02d5f8f'),
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
