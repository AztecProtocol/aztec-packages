import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';

export function getVersions(config?: ChainConfig): Partial<ComponentsVersions> {
  return config
    ? getComponentsVersionsFromConfig(config, protocolContractsHash, getVKTreeRoot())
    : {
        l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
        l2ProtocolContractsHash: protocolContractsHash.toString(),
      };
}
