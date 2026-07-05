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
  AuthRegistry: AztecAddress.fromString('0x210bb9a735aeafa62550cecd9556a63a86722bdf609c385e3073ddac4f36c5d0'),
  MultiCallEntrypoint: AztecAddress.fromString('0x0d7a40e0b5ca489d4511a7ad81ab350b200de1d57f053423c29c0673dc5738aa'),
  PublicChecks: AztecAddress.fromString('0x14574f1307405dfe60f7c142bf5f647d78565a2f7b8f3377d967d42d79b20069'),
  HandshakeRegistry: AztecAddress.fromString('0x00e0ba4cebbef0ebe8cef27c0f01fbc8fec405ed665c6455b0b42848ddb9e466'),
};

export const StandardContractClassId: Record<StandardContractName, Fr> = {
  AuthRegistry: Fr.fromString('0x13991191522a755e7e145f87ca476e30e7e0cbf9f3feba678983b1fc989d44e0'),
  MultiCallEntrypoint: Fr.fromString('0x1d6485198a7f0f25054b16577bb0eb1a700543b60c7e19de2119b7214c030a84'),
  PublicChecks: Fr.fromString('0x0f177ea657a6ebdfb3e914a91c45d9cac2fc1b126a9d6f8c7c1f5b66f261842e'),
  HandshakeRegistry: Fr.fromString('0x0af9d1e794ed6f1725b28ccc791563991f053778411cce97c180d8c35ea5c8c1'),
};

export const StandardContractClassIdPreimage: Record<
  StandardContractName,
  { artifactHash: Fr; privateFunctionsRoot: Fr; publicBytecodeCommitment: Fr }
> = {
  AuthRegistry: {
    artifactHash: Fr.fromString('0x05b391dbd82c29c2e03211dea717cf0f9ab541ee03afaac0c07af6e2776c595a'),
    privateFunctionsRoot: Fr.fromString('0x1b16157ab0b322bcaf3de5cb197b276c5e29ca3668a0c440668ca56aa7dfff77'),
    publicBytecodeCommitment: Fr.fromString('0x0c7984b020afc901da3b5898b8f94d1d9a09ea2b37d6e0043409abc0b0332906'),
  },
  MultiCallEntrypoint: {
    artifactHash: Fr.fromString('0x18e65098537ecaf9d3849883502299db79c74fc7fb2ebe3c7b2a322c607a6fa4'),
    privateFunctionsRoot: Fr.fromString('0x10228bc99b6715f15c866a1df0d9cb63c31920cb8e61a6b79058bf98658d7f39'),
    publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  },
  PublicChecks: {
    artifactHash: Fr.fromString('0x188a8567fa8d46fea84f05628da6b1ef6028cb91d2bf1341284bf6dbc5e98ea3'),
    privateFunctionsRoot: Fr.fromString('0x202860adb1b8975971eeaf571aaaa88a27f4035290d58532ae7d60b0dfaad54c'),
    publicBytecodeCommitment: Fr.fromString('0x013c4f854a5c87c9daf86c5f9bc07a42c2a061f1d924a5b3564ec7edc8e18cb7'),
  },
  HandshakeRegistry: {
    artifactHash: Fr.fromString('0x1b35538b90af6f162473174aa0ca239f8d2dd783e3b6cb500569c2c743a94ffa'),
    privateFunctionsRoot: Fr.fromString('0x2443fe2618b0c345bb7629ee0775af69c6695a3eca6ebe1cd5d23617a00a5297'),
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
      vkHash: Fr.fromString('0x2d46cdec4cc2afd813ba2b50106dba455821e4c7b3c10f1c7293bbc759dccf64'),
    },
  ],
  MultiCallEntrypoint: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f04908a9'),
      ),
      vkHash: Fr.fromString('0x0699bae67183ce084da1cd76ce05d18f45f796237f2baafaf7d4bfbf9663c433'),
    },
  ],
  PublicChecks: [],
  HandshakeRegistry: [
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x000000000000000000000000000000000000000000000000000000009968d9e2'),
      ),
      vkHash: Fr.fromString('0x11d4d7327cb1cb71466ef6abd40aed3154227e730de34ff12527060056dff360'),
    },
    {
      selector: FunctionSelector.fromField(
        Fr.fromString('0x00000000000000000000000000000000000000000000000000000000f7b8f754'),
      ),
      vkHash: Fr.fromString('0x27bd4a07ac1e6385c3e35a83dfcf81512a947eceea024c603f62b9d26aba88f4'),
    },
  ],
};
