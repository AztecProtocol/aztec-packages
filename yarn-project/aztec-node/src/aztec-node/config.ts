import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import { type GenesisStateConfig, genesisStateConfigMappings } from '@aztec/ethereum/config';
import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
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
  type ProverNodeConfig,
  proverNodeConfigMappings,
  specificProverNodeConfigMappings,
} from '@aztec/prover-node/config';
import {
  type SequencerClientConfig,
  type SequencerTxSenderConfig,
  sequencerClientConfigMappings,
} from '@aztec/sequencer-client/config';
import { slasherConfigMappings } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type NodeRPCConfig, nodeRpcConfigMappings } from '@aztec/stdlib/config';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';
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
  SlasherConfig &
  ProverNodeConfig & {
    /** Whether the validator is disabled for this node */
    disableValidator: boolean;
    /** Whether to skip waiting for the archiver to be fully synced before starting other services */
    skipArchiverInitialSync: boolean;
    /** A flag to force verification of tx Chonk proofs. Only used for testnet */
    debugForceTxProofVerification: boolean;
    /** Whether to enable the prover node as a subsystem. */
    enableProverNode: boolean;
    /** Whether to run the slashing watchers to collect offenses even if not a validator. */
    enableOffenseCollection: boolean;
    /**
     * Test-only: use the deterministic AutomineSequencer instead of the production Sequencer.
     * Requires `aztecTargetCommitteeSize === 0` on the deployed rollup and anvil-backed L1.
     * See `AUTOMINE_E2E_OPTS` in `end-to-end/src/fixtures/fixtures.ts`.
     */
    useAutomineSequencer?: boolean;
    /**
     * Test-only: have the AutomineSequencer automatically prove epochs (write epoch out hashes into
     * the L1 Outbox and advance the proven tip) as checkpoints land, replacing the standalone
     * `EpochTestSettler`. Set by the local network/sandbox; the e2e `AUTOMINE_E2E_OPTS` fixture leaves
     * it off so tests drive proving manually via `prove` / `cheatCodes.rollup.markAsProven`.
     */
    automineEnableProveEpoch?: boolean;
  };

export const aztecNodeConfigMappings: ConfigMappingsType<AztecNodeConfig> = {
  ...dataConfigMappings,
  ...keyStoreConfigMappings,
  ...archiverConfigMappings,
  ...sequencerClientConfigMappings,
  ...proverNodeConfigMappings,
  ...validatorClientConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...p2pConfigMappings,
  ...sentinelConfigMappings,
  ...sharedNodeConfigMappings,
  ...genesisStateConfigMappings,
  ...nodeRpcConfigMappings,
  ...slasherConfigMappings,
  ...specificProverNodeConfigMappings,
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Whether the validator is disabled for this node.',
    ...booleanConfigHelper(),
  },
  skipArchiverInitialSync: {
    env: 'SKIP_ARCHIVER_INITIAL_SYNC',
    description: 'Whether to skip waiting for the archiver to be fully synced before starting other services.',
    ...booleanConfigHelper(false),
  },
  debugForceTxProofVerification: {
    env: 'DEBUG_FORCE_TX_PROOF_VERIFICATION',
    description: 'Whether to skip waiting for the archiver to be fully synced before starting other services.',
    ...booleanConfigHelper(false),
  },
  enableProverNode: {
    env: 'ENABLE_PROVER_NODE',
    description: 'Whether to enable the prover node as a subsystem.',
    ...booleanConfigHelper(false),
  },
  enableOffenseCollection: {
    env: 'OFFENSE_COLLECTION_ENABLED',
    description: 'Whether to run the slashing watchers to collect offenses even if not a validator.',
    ...booleanConfigHelper(false),
  },
  useAutomineSequencer: {
    env: 'USE_AUTOMINE_SEQUENCER',
    description: 'Test-only: use AutomineSequencer instead of the production Sequencer.',
    ...booleanConfigHelper(false),
  },
  automineEnableProveEpoch: {
    env: 'AUTOMINE_ENABLE_PROVE_EPOCH',
    description: 'Test-only: have the AutomineSequencer automatically prove epochs as checkpoints land.',
    ...booleanConfigHelper(false),
  },
};

/**
 * Returns the config of the aztec node from environment variables with reasonable defaults.
 * @returns A valid aztec node config.
 */
export function getConfigEnvVars(): AztecNodeConfig {
  return getConfigFromMappings<AztecNodeConfig>(aztecNodeConfigMappings);
}

type ConfigRequiredToBuildKeyStore = SequencerClientConfig & SharedNodeConfig & ValidatorClientConfig;

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
    publisher: config.sequencerPublisherAddresses ?? [],
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
    ? config.validatorPrivateKeys.getValue().map((x: string) => ethPrivateKeySchema.parse(x))
    : [];

  if (!ethPrivateKeys.length) {
    return undefined;
  }
  const coinbase = config.coinbase ?? EthAddress.fromString(privateKeyToAddress(ethPrivateKeys[0]));
  const feeRecipient = config.feeRecipient ?? AztecAddress.ZERO;

  const publisherKeys = config.sequencerPublisherPrivateKeys
    ? config.sequencerPublisherPrivateKeys.map((k: { getValue: () => string }) =>
        ethPrivateKeySchema.parse(k.getValue()),
      )
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
  config: SequencerTxSenderConfig & SequencerClientConfig & SharedNodeConfig,
): KeyStore | undefined {
  if (config.web3SignerUrl !== undefined && config.web3SignerUrl.length > 0) {
    return createKeyStoreFromWeb3Signer(config);
  }

  return createKeyStoreFromPrivateKeys(config);
}
