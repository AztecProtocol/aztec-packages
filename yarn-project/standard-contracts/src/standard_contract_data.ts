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
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0c6dadef779e0146561013ef67feb18c2d5dc437b633520d4f44d6be7e8d2d36'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x04caca8219eda3d3b898b54c4660678b50dabb310c7850d3b9c3a2038ae9142c',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x092cfb88b0d0574239e8e495f053900ea45d89a821f5dd119b6495317766f794'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x20921f1a64277e991098685ba2a9c822f1f7451b537298b4f4769f3148722248',
=======
  AuthRegistry: AztecAddress.fromStringUnsafe('0x0f53c9d679c6aa851b46bfc07e14bd070d5948b6ad1a4f7c54909f61dceb146a'),
  MultiCallEntrypoint: AztecAddress.fromStringUnsafe(
    '0x251d9cb1aa645672268b9b9082dedba22986ba9068d5ad8ecfae53f24e16c109',
  ),
  PublicChecks: AztecAddress.fromStringUnsafe('0x2ebeb911fc3963e7d1869af2dc7fee318d1edbc957edb46a0e99b46867ba4492'),
  HandshakeRegistry: AztecAddress.fromStringUnsafe(
    '0x1523a141a33e5aa8d72624823b8592b87799c9ee0c086dd9f3c80661905366ab',
>>>>>>> e101890218 (feat: merge-train/fairies-v5 (#24505))
  ),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
<<<<<<< HEAD
  AuthRegistry: Fr.fromString('0x2a63d9bcd2b7c355cd1925f80f0d3067b186ffcbacb3a4aa690658e6638bbe47'),
  MultiCallEntrypoint: Fr.fromString('0x26225a7c38aeb072dae29fc19e0f4f298c409145c150083c9cf01e65bb186bc3'),
  PublicChecks: Fr.fromString('0x0e3156deaeb90a559f7af36c1db5e0ddd51ec2c1d7f6bb1e5b23cb72572885c9'),
  HandshakeRegistry: Fr.fromString('0x28131f263bdad5cb47f07a93fd0a56678bbe2eac49686e1d118a080ed0265354'),
=======
  AuthRegistry: Fr.fromString('0x11e819a375b8d47f193cff233758712432d84903ac4f413f37aff6bc24309170'),
  MultiCallEntrypoint: Fr.fromString('0x0d11632fba173ff9c08415f61fef5fb27d8e73a3525d27f7463479c57ff65bd4'),
  PublicChecks: Fr.fromString('0x0a5482c4b3d5a757daa1a97929a28f85b70a5562e26a7fdddb9278c9c6024e2d'),
  HandshakeRegistry: Fr.fromString('0x0c2eccb43c5ae540321284fd044f9cbb1ddc4aaea97fe78d001a4ef8dadd2a57'),
>>>>>>> e101890218 (feat: merge-train/fairies-v5 (#24505))
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x033b5d1756570d4f8744f822ab261f254cf1c0d7fa320ffde8b03e55f91f5312'),
    privateFunctionsRoot: Fr.fromString('0x211b33685bcb41a5d3a2a84d8ec021c7280392cb4aae5a778eafe5282dbba740'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x24f9e774e0726d07e20754b5ea7b9199946c98d95bc4fffd524f4e76b44f373a'),
    privateFunctionsRoot: Fr.fromString('0x2cd2008a79f59c3f2caa996962b0b35889f5ee8fcf175282406a2a521550cc70'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x03c82e67cf74a3cbf279daba0a4428053be9d4943698787d78d590d020b1cf52'),
=======
    artifactHash: Fr.fromString('0x11c7386b924a9151669372b377680f354b715dfe83e6104eb2837efed8060abd'),
    privateFunctionsRoot: Fr.fromString('0x17b584350f4c3ccafd8f688729afb9feab8976114fb40012e9dee65022c072a4'),
    publicBytecodeCommitment: Fr.fromString('0x2545f39893766508ce37bb5cea5e4dcab04c6f7f79f3089b1c076876e9d268b2'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x02b6df62ce338186513b4bd78f23ebcf44283115880b4968af2c38bcab60e542'),
    privateFunctionsRoot: Fr.fromString('0x0e68dfbb256e80b08b3aef47aca1f2669e97a9c6259787893c1223ac083ad5d5'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x09fa72ba16ea01a1800d606a0ee5476925d54726dfa82990da875d25456e98d1'),
>>>>>>> e101890218 (feat: merge-train/fairies-v5 (#24505))
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
<<<<<<< HEAD
    artifactHash: Fr.fromString('0x09b088f5acc0969f04e733e09f2ed9d334f6160483688542e43f74275499e4ee'),
    privateFunctionsRoot: Fr.fromString('0x11a10bd77aa19bdb444e8488129db440f64e291ddf781052e298a593b4941de7'),
=======
    artifactHash: Fr.fromString('0x0428d4f21932e3a76c468b2fe1431bb6ac68a7993c3f88416b02c35f15fb828a'),
    privateFunctionsRoot: Fr.fromString('0x02a4dba36389845b8ef0108562f7536d3284f07ca678558fc3c3bce3b24ee821'),
>>>>>>> e101890218 (feat: merge-train/fairies-v5 (#24505))
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
      vkHash: Fr.fromString('0x2979f430e7a6d4c2222a35a5e00f9c8c0e41c5ad9afa95d8d718f5c1f57ac4f2'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x1bc6ab9244a92fe2143e42a1856ea0b29415e0530eda89dd634a0b8630780593'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x0000000000000000000000000000000000000000000000000000000019f8b409'),
      ),
      vkHash: Fr.fromString('0x0557df5ba7ab8ecdcf13754da6cbedff4c0654d87a4138b6eabfebe414a7f35d'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000db548fcf'),
      ),
      vkHash: Fr.fromString('0x1e4bc826140c11db39be74ec35c18cc8302b408691411b0d2576981bd80ef7d0'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f1ff839b'),
      ),
      vkHash: Fr.fromString('0x1f04747f14e80766fc5f21879674dba7e8b5a7ec1ac5506d59252ad433b76f72'),
    },
  ],
};
