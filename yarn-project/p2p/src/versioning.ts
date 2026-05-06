import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { compressComponentVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';

import type { SignableENR } from '@nethermindeth/enr';

import { AZTEC_ENR_CLIENT_VERSION_KEY, AZTEC_ENR_KEY } from './types/index.js';

/** Returns the component versions based on config and this build. */
export function getVersions(config: ChainConfig) {
  return getComponentsVersionsFromConfig(config, protocolContractsHash, getVKTreeRoot());
}

/** Sets the aztec key on the ENR record with versioning info. */
export function setAztecEnrKey(enr: SignableENR, config: ChainConfig) {
  const versions = getVersions(config);
  enr.set(AZTEC_ENR_KEY, Buffer.from(compressComponentVersions(versions)));
  return versions;
}

/** Sets the Aztec client version on ENR record **/
export function setAztecClientVersionEnrKey(enr: SignableENR, clientVersion: string) {
  if (clientVersion) {
    enr.set(AZTEC_ENR_CLIENT_VERSION_KEY, Buffer.from(clientVersion));
  }
}
