import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import {
  type GenesisStateConfig,
  type L1ContractAddresses,
  genesisStateConfigMappings,
  l1ContractAddressesMapping,
} from '@aztec/ethereum';
import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type SharedNodeConfig, sharedNodeConfigMappings } from '@aztec/node-lib/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import { type ProverClientUserConfig, proverClientConfigMappings } from '@aztec/prover-client/config';
import { type SequencerClientConfig, sequencerClientConfigMappings } from '@aztec/sequencer-client/config';
import { type SlasherConfig, slasherConfigMappings } from '@aztec/slasher';
import { type NodeRPCConfig, nodeRpcConfigMappings } from '@aztec/stdlib/config';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client/config';
import { type WorldStateConfig, worldStateConfigMappings } from '@aztec/world-state/config';

import { type SentinelConfig, sentinelConfigMappings } from '../sentinel/config.js';

export { sequencerClientConfigMappings, type SequencerClientConfig };

/**
 * The configuration the aztec node.
 */
export type AztecNodeConfig = ArchiverConfig &
  SequencerClientConfig &
  ValidatorClientConfig &
  ProverClientUserConfig &
  WorldStateConfig &
  Pick<ProverClientUserConfig, 'bbBinaryPath' | 'bbWorkingDirectory' | 'realProofs'> &
  P2PConfig &
  DataStoreConfig &
  SentinelConfig &
  SharedNodeConfig &
  GenesisStateConfig &
  NodeRPCConfig &
  SlasherConfig & {
    /** L1 contracts addresses */
    l1Contracts: L1ContractAddresses;
    /** Whether the validator is disabled for this node */
    disableValidator: boolean;
  };

export const aztecNodeConfigMappings: ConfigMappingsType<AztecNodeConfig> = {
  ...dataConfigMappings,
  ...archiverConfigMappings,
  ...sequencerClientConfigMappings,
  ...validatorClientConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...p2pConfigMappings,
  ...sentinelConfigMappings,
  ...sharedNodeConfigMappings,
  ...genesisStateConfigMappings,
  ...nodeRpcConfigMappings,
  ...slasherConfigMappings,
  l1Contracts: {
    description: 'The deployed L1 contract addresses',
    nested: l1ContractAddressesMapping,
  },
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Whether the validator is disabled for this node.',
    ...booleanConfigHelper(),
  },
};

/**
 * Returns the config of the aztec node from environment variables with reasonable defaults.
 * @returns A valid aztec node config.
 */
export function getConfigEnvVars(): AztecNodeConfig {
  return getConfigFromMappings<AztecNodeConfig>(aztecNodeConfigMappings);
}
