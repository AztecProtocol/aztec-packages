// Deployment data of superseded standard HandshakeRegistry versions. When a release changes the registry (and thus
// its canonical address), contracts compiled against earlier releases keep the old address baked into their
// bytecode, and the old instance stays live onchain. Archiving the retired deployment here (data below, trimmed
// artifact under `artifacts-historical/`) lets PXE keep registering and authorizing it, so apps built on older
// releases keep working against newer aztec.js versions.
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StandardContractData } from '../make_standard_contract.js';

/** Deployment data of the standard HandshakeRegistry released in v5.0.1 and superseded in v5.1.0. */
export const HANDSHAKE_REGISTRY_V5_0_1_DATA: StandardContractData = {
  address: AztecAddress.fromStringUnsafe('0x086c3c67589e1141c70ed0ed8ae324c51d3bf7c5637043fd84c424ffb625831d'),
  salt: new Fr(1),
  classId: Fr.fromString('0x020ec1998d06036ddab4ba170e9b0d9b96e52beb58aa5ea83d72b22f589cbe6c'),
  artifactHash: Fr.fromString('0x2dd01b80cabc352f7d01799a6e5dd6255cc0d7f01fe42d270760d0bf0a0b5daf'),
  privateFunctionsRoot: Fr.fromString('0x0c80100ee31d91778c8f3d4453d056a58467b50f86d446f3209b96d87acb354e'),
  publicBytecodeCommitment: Fr.fromString('0x0ce4c618c3ed7f3a20410e618c06bb701e150af7fe28a3e92f68e7733809f33e'),
  initializationHash: Fr.fromString('0x0000000000000000000000000000000000000000000000000000000000000000'),
  privateFunctions: [
    {
      selector: FunctionSelector.fromField(new Fr(0x19f8b409)),
      vkHash: Fr.fromString('0x033a99c31fd390e320398efa03eb1a34d0db2f2e0201fbb0062aa915f406f3d7'),
    },
    {
      selector: FunctionSelector.fromField(new Fr(0xdb548fcf)),
      vkHash: Fr.fromString('0x12964f25be85fded4079591a3871e85d15967c75fd70f3d0edf10d72abfea59c'),
    },
    {
      selector: FunctionSelector.fromField(new Fr(0xf1ff839b)),
      vkHash: Fr.fromString('0x049120d4c9a12a2286c83df31064637b53746ea13868b0756174dcb3e036bb9d'),
    },
  ],
};

/**
 * Addresses of superseded standard HandshakeRegistry deployments that remain live onchain. PXE registers these
 * alongside the current deployment and authorizes their read functions, so contracts compiled against older
 * releases can still reach the registry version they were built for.
 */
export const HISTORICAL_STANDARD_HANDSHAKE_REGISTRY_ADDRESSES: AztecAddress[] = [
  HANDSHAKE_REGISTRY_V5_0_1_DATA.address,
];
