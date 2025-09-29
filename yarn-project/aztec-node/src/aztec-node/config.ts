import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import {
  type GenesisStateConfig,
  type L1ContractAddresses,
  genesisStateConfigMappings,
  l1ContractAddressesMapping,
} from '@aztec/ethereum';
import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import {
  type KeyStore,
  type ValidatorKeyStore,
  ethPrivateKeySchema,
  keyStoreConfigMappings,
} from '@aztec/node-keystore';
import { type SharedNodeConfig, sharedNodeConfigMappings } from '@aztec/node-lib/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import { type ProverClientUserConfig, proverClientConfigMappings } from '@aztec/prover-client/config';
import {
  type SequencerClientConfig,
  type TxSenderConfig,
  sequencerClientConfigMappings,
} from '@aztec/sequencer-client/config';
import { slasherConfigMappings } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type NodeRPCConfig, nodeRpcConfigMappings } from '@aztec/stdlib/config';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type ValidatorClientConfig, validatorClientConfigMappings } from '@aztec/validator-client/config';
import { type WorldStateConfig, worldStateConfigMappings } from '@aztec/world-state/config';

import { privateKeyToAddress } from 'viem/accounts';

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
  ...keyStoreConfigMappings,
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

type ConfigRequiredToBuildKeyStore = TxSenderConfig & SequencerClientConfig & SharedNodeConfig & ValidatorClientConfig;

function createKeyStoreFromWeb3Signer(config: ConfigRequiredToBuildKeyStore): KeyStore | undefined {
  const validatorKeyStores: ValidatorKeyStore[] = [];

  if (
    config.web3SignerUrl === undefined ||
    config.web3SignerUrl.length === 0 ||
    config.validatorAddresses === undefined ||
    config.validatorAddresses.length === 0
  ) {
    return undefined;
  }

  validatorKeyStores.push({
    attester: config.validatorAddresses,
    feeRecipient: config.feeRecipient ?? AztecAddress.ZERO,
    coinbase: config.coinbase ?? config.validatorAddresses[0],
    remoteSigner: config.web3SignerUrl,
    publisher: config.publisherAddresses ?? [],
  });

  const keyStore: KeyStore = {
    schemaVersion: 1,
    slasher: undefined,
    prover: undefined,
    remoteSigner: undefined,
    validators: validatorKeyStores,
  };
  return keyStore;
}

function createKeyStoreFromPrivateKeys(config: ConfigRequiredToBuildKeyStore): KeyStore | undefined {
  const validatorKeyStores: ValidatorKeyStore[] = [];
  const ethPrivateKeys = config.validatorPrivateKeys
    ? config.validatorPrivateKeys.getValue().map(x => ethPrivateKeySchema.parse(x))
    : [];

  if (!ethPrivateKeys.length) {
    return undefined;
  }
  const coinbase = config.coinbase ?? EthAddress.fromString(privateKeyToAddress(ethPrivateKeys[0]));
  const feeRecipient = config.feeRecipient ?? AztecAddress.ZERO;

  const publisherKeys = config.publisherPrivateKeys
    ? config.publisherPrivateKeys.map(k => ethPrivateKeySchema.parse(k.getValue()))
    : [];

  validatorKeyStores.push({
    attester: ethPrivateKeys,
    feeRecipient: feeRecipient,
    coinbase: coinbase,
    remoteSigner: undefined,
    publisher: publisherKeys,
  });

  const keyStore: KeyStore = {
    schemaVersion: 1,
    slasher: undefined,
    prover: undefined,
    remoteSigner: undefined,
    validators: validatorKeyStores,
  };
  return keyStore;
}

export function createKeyStoreForValidator(
  config: TxSenderConfig & SequencerClientConfig & SharedNodeConfig,
): KeyStore | undefined {
  if (config.web3SignerUrl !== undefined && config.web3SignerUrl.length > 0) {
    return createKeyStoreFromWeb3Signer(config);
  }

  return createKeyStoreFromPrivateKeys(config);
}
