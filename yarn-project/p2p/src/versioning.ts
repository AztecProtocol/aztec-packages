import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import {
  type ComponentsVersions,
  checkCompressedComponentVersion,
  compressComponentVersions,
  getComponentsVersionsFromConfig,
} from '@aztec/stdlib/versioning';

import type { SignableENR } from '@chainsafe/enr';
import xxhashFactory from 'xxhash-wasm';

import { AZTEC_ENR_CLIENT_VERSION_KEY, AZTEC_ENR_KEY } from './types/index.js';

const USE_XX_HASH = false; // Enable to reduce the size of the ENR record for production
const XX_HASH_LEN = 8;
const xxhash = await xxhashFactory();

/** Returns the component versions based on config and this build. */
export function getVersions(config: ChainConfig) {
  return getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot());
}

/** Sets the aztec key on the ENR record with versioning info. */
export function setAztecEnrKey(enr: SignableENR, config: ChainConfig, useXxHash = USE_XX_HASH) {
  const versions = getVersions(config);
  const value = versionsToEnrValue(versions, useXxHash);
  enr.set(AZTEC_ENR_KEY, value);
  return versions;
}

/** Sets the Aztec client version on ENR record **/
export function setAztecClientVersionEnrKey(enr: SignableENR, clientVersion: string) {
  if (clientVersion) {
    enr.set(AZTEC_ENR_CLIENT_VERSION_KEY, Buffer.from(clientVersion));
  }
}

/** Checks the given value from an ENR record against the expected versions. */
export function checkAztecEnrVersion(enrValue: Buffer, expectedVersions: ComponentsVersions) {
  if (enrValue.length === XX_HASH_LEN) {
    const expected = versionsToEnrValue(expectedVersions, true);
    if (!Buffer.from(enrValue).equals(expected)) {
      throw new Error(`Expected ENR version ${expected.toString('hex')} but received ${enrValue.toString('hex')}`);
    }
  } else {
    const actual = Buffer.from(enrValue).toString();
    checkCompressedComponentVersion(actual, expectedVersions);
  }
}

function versionsToEnrValue(versions: ComponentsVersions, useXxHash: boolean) {
  const compressed = compressComponentVersions(versions);
  return useXxHash ? toBufferBE(xxhash.h64(compressed), XX_HASH_LEN) : Buffer.from(compressed);
}
