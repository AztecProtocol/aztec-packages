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
  AuthRegistry: AztecAddress.fromString('0x078ce281bb3962572290790f5f880043173df003ba54f4ce6b5854e6f9e17b09'),
  MultiCallEntrypoint: AztecAddress.fromString('0x01fa59ea6ebe00fed99890e61131cb600ade22418fc124fb8f8eb621ae0af142'),
  PublicChecks: AztecAddress.fromString('0x05d900a6ed1b4ad3ff52cbe5f98d9b291b0f35c6dd5c41b1642659344d234bfe'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x2c02fdcd8aac5935c8c42a2869fc49b94e77f6f97b204ce998e73d86c88e5fa3'),
  MultiCallEntrypoint: Fr.fromString('0x15414328b0ad1f2e2c460aa071feaafcbd45fa4d92ac393c2abfdc9b125e4245'),
  PublicChecks: Fr.fromString('0x022bbd3c085d6a09ec500110852441419c7b1e6dc21a8d459233b72a84d03a1f'),
=======
  AuthRegistry: AztecAddress.fromString('0x02d06fabf56d3b3efd3d6f804b515e716f05fbd0bce2ffdf2e2d50660b0c8641'),
  MultiCallEntrypoint: AztecAddress.fromString('0x2dd1c425d31f2c38b0468ec3e09fcf4bd066b289bea69e9ec7b2f5cf32dd2bd7'),
  PublicChecks: AztecAddress.fromString('0x1a19f689c95f22ac9adf9dfc3ba634802c038b094f27bbc482bdbf0d33e70740'),
  HandshakeRegistry: AztecAddress.fromString('0x20e98e7deb9b3d957a321b6ccd84df520322f0cf448643999fc4fbd84521d957'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x208dc1b9da38bf5cad11ca8a7bff8a50fc22bd08f11f1dc0cf2c1ff96381aad6'),
  MultiCallEntrypoint: Fr.fromString('0x0426e7bb90ff70c932b0c3b0a6e7f5f80139a64eeb1d8e5a0ab07b1b924fea92'),
  PublicChecks: Fr.fromString('0x19e57c5437552d2f4caab2ad18170ab0df293494e8aac182c2afc3283e9eabeb'),
  HandshakeRegistry: Fr.fromString('0x2bb2e51ddc8c6d66164d866df6592f3f13b680bcda34667d8e3d6d40376d7795'),
>>>>>>> origin/public-next
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x0dd24a86cce5ff4ef33ca14f16359c5a154ce3f1ed91a9570dd5343569f5386f'),
    privateFunctionsRoot: Fr.fromString('0x15c5b7a202c55d28fae136f97d8e60328e235afd6daf1ef9ac4c41afc197a17b'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x1f8c5717b0e478e63f462f9792969865684f8403b4608980b1a83324c03dd498'),
    privateFunctionsRoot: Fr.fromString('0x04da9d9bfe3b810c65c590f78025f7dad7923c0223a7271d391b9598e3254def'),
=======
    artifactHash: Fr.fromString('0x256760c2b52314fb9f2597374e47e92920524c9602e4447c05cf78d512d81982'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x21412a6ddefb8693ec387cc77328b0f8d4533b906ca91863510c0f84f2a524bb'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
>>>>>>> origin/public-next
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x2456d5ee2175bc8b061b85fd28fe89053c2d01cd0510237ce381e687a2299cf5'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x239536a22445ef2c8517dd1569dd6935f0397d987706c464807e570e43de63b2'),
    privateFunctionsRoot: Fr.fromString('0x22071f2bef1999fe9698359ef95acfeb9cd7c473d04207ed160715c81292c6b3'),
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
      vkHash: Fr.fromString('0x035db3173b6dc6305d989fe910690cc0a556bf30261c6b4235144403e5378635'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000005fa93894'),
      ),
      vkHash: Fr.fromString('0x0ed3c8564b7f78e1dd558a0e38719c7056b27ae7f48aed795ffa2d6d84bae85d'),
    },
  ],
};
