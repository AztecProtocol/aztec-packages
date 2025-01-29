import { compressComponentVersions, getComponentsVersionsFromConfig } from '@aztec/circuit-types';
import { type ChainConfig } from '@aztec/circuit-types/config';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { type SignableENR } from '@chainsafe/enr';

import { AZTEC_ENR_KEY } from './services/types.js';

/** Returns the component versions based on config and this build. */
export function getVersions(config: ChainConfig) {
  return getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot());
}

/** Sets the aztec key on the ENR record with versioning info. */
export function setAztecEnrKey(enr: SignableENR, config: ChainConfig) {
  const versions = getVersions(config);
  enr.set(AZTEC_ENR_KEY, Buffer.from(compressComponentVersions(versions)));
  return versions;
}
