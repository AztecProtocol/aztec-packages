import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';

export function getVersions(config?: ChainConfig): Partial<ComponentsVersions> {
  return config
    ? getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot())
    : {
        l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
        l2ProtocolContractsTreeRoot: protocolContractTreeRoot.toString(),
      };
}
