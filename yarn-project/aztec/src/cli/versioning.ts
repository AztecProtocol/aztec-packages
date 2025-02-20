import { getComponentsVersionsFromConfig } from '@aztec/circuit-types';
import type { ComponentsVersions } from '@aztec/circuit-types';
import type { ChainConfig } from '@aztec/circuit-types/config';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

export function getVersions(config?: ChainConfig): Partial<ComponentsVersions> {
  return config
    ? getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot())
    : {
        l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
        l2ProtocolContractsTreeRoot: protocolContractTreeRoot.toString(),
      };
}
