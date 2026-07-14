import type { ACVMConfig, BBConfig } from '@aztec/bb-prover/config';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  pickConfigMappings,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type KeyStoreConfig, keyStoreConfigMappings } from '@aztec/node-keystore/config';
import { ethPrivateKeySchema } from '@aztec/node-keystore/schemas';
import type { KeyStore } from '@aztec/node-keystore/types';
import { type SharedNodeConfig, sharedNodeConfigMappings } from '@aztec/node-lib/config';
import {
  type ProverAgentConfig,
  type ProverBrokerConfig,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
} from '@aztec/prover-client/broker/config';
import { type ProverClientUserConfig, bbConfigMappings, proverClientConfigMappings } from '@aztec/prover-client/config';
import {
  type ProverPublisherConfig,
  type ProverTxSenderConfig,
  proverPublisherConfigMappings,
  proverTxSenderConfigMappings,
} from '@aztec/sequencer-client/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';

export type ProverNodeConfig = ProverClientUserConfig &
  ProverPublisherConfig &
  ProverTxSenderConfig &
  DataStoreConfig &
  KeyStoreConfig &
  SpecificProverNodeConfig &
  Pick<SharedNodeConfig, 'web3SignerUrl'>;

export type SpecificProverNodeConfig = {
  proverNodeMaxPendingJobs: number;
  proverNodePollingIntervalMs: number;
  proverNodeMaxParallelBlocksPerEpoch: number;
  proverNodeFailedEpochStore: string | undefined;
  proverNodeEpochProvingDelayMs: number | undefined;
  proverNodeDisableProofPublish?: boolean;
  txGatheringTimeoutMs: number;
  txGatheringIntervalMs: number;
  txGatheringBatchSize: number;
  txGatheringMaxParallelRequestsPerNode: number;
  proofSubmissionTargetAddress?: EthAddress;
};

export const specificProverNodeConfigMappings: ConfigMappingsType<SpecificProverNodeConfig> = {
  proverNodeMaxPendingJobs: {
    env: 'PROVER_NODE_MAX_PENDING_JOBS',
    description: 'The maximum number of pending jobs for the prover node',
    ...numberConfigHelper(10),
  },
  proverNodePollingIntervalMs: {
    env: 'PROVER_NODE_POLLING_INTERVAL_MS',
    description: 'The interval in milliseconds to poll for new jobs',
    ...numberConfigHelper(1000),
  },
  proverNodeMaxParallelBlocksPerEpoch: {
    env: 'PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH',
    description: 'The Maximum number of blocks to process in parallel while proving an epoch',
    ...numberConfigHelper(0),
  },
  proverNodeFailedEpochStore: {
    env: 'PROVER_NODE_FAILED_EPOCH_STORE',
    description: 'File store where to upload node state when an epoch fails to be proven',
    defaultValue: undefined,
  },
  proverNodeEpochProvingDelayMs: {
    description:
      'Optional delay in milliseconds to wait for late-arriving events (e.g. reorgs) to settle before starting top-tree proving for an epoch',
    defaultValue: undefined,
  },
  txGatheringIntervalMs: {
    env: 'PROVER_NODE_TX_GATHERING_INTERVAL_MS',
    description: 'How often to check that tx data is available',
    ...numberConfigHelper(1_000),
  },
  txGatheringBatchSize: {
    env: 'PROVER_NODE_TX_GATHERING_BATCH_SIZE',
    description: 'How many transactions to gather from a node in a single request',
    ...numberConfigHelper(10),
  },
  txGatheringMaxParallelRequestsPerNode: {
    env: 'PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS_PER_NODE',
    description: 'How many tx requests to make in parallel to each node',
    ...numberConfigHelper(100),
  },
  txGatheringTimeoutMs: {
    env: 'PROVER_NODE_TX_GATHERING_TIMEOUT_MS',
    description: 'How long to wait for tx data to be available before giving up',
    ...numberConfigHelper(120_000),
  },
  proverNodeDisableProofPublish: {
    env: 'PROVER_NODE_DISABLE_PROOF_PUBLISH',
    description: 'Whether the prover node skips publishing proofs to L1',
    ...booleanConfigHelper(false),
  },
  proofSubmissionTargetAddress: {
    env: 'PROVER_NODE_PROOF_SUBMISSION_TARGET_ADDRESS',
    description:
      'Optional L1 address the submitEpochRootProof tx is sent to. Must expose the identical submitEpochRootProof ABI ' +
      'and forward to the rollup. Defaults to the rollup address.',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: undefined,
  },
};

export const proverNodeConfigMappings: ConfigMappingsType<ProverNodeConfig> = {
  ...dataConfigMappings,
  ...keyStoreConfigMappings,
  ...proverClientConfigMappings,
  ...proverPublisherConfigMappings,
  ...proverTxSenderConfigMappings,
  ...specificProverNodeConfigMappings,
  ...pickConfigMappings(sharedNodeConfigMappings, ['web3SignerUrl']),
};

export function getProverNodeConfigFromEnv(): ProverNodeConfig {
  return getConfigFromMappings(proverNodeConfigMappings);
}

export function getProverNodeBrokerConfigFromEnv(): ProverBrokerConfig {
  return {
    ...getConfigFromMappings(proverBrokerConfigMappings),
  };
}

export function getProverNodeAgentConfigFromEnv(): ProverAgentConfig & BBConfig & ACVMConfig {
  return {
    ...getConfigFromMappings(proverAgentConfigMappings),
    ...getConfigFromMappings(bbConfigMappings),
  };
}

function createKeyStoreFromWeb3Signer(config: ProverNodeConfig): KeyStore | undefined {
  // If we don't have a valid prover Id then we can't build a valid key store with remote signers
  if (config.proverId === undefined) {
    return undefined;
  }

  // Also, we need at least one publisher address.
  const publishers = config.proverPublisherAddresses ?? [];

  if (publishers.length === 0) {
    return undefined;
  }

  const keyStore: KeyStore = {
    schemaVersion: 1,
    slasher: undefined,
    prover: {
      id: config.proverId,
      publisher: publishers,
    },
    remoteSigner: config.web3SignerUrl,
    validators: undefined,
  };
  return keyStore;
}

function createKeyStoreFromPublisherKeys(config: ProverNodeConfig): KeyStore | undefined {
  // Extract the publisher keys from the provided config.
  const publisherKeys = config.proverPublisherPrivateKeys
    ? config.proverPublisherPrivateKeys.map((k: { getValue: () => string }) => ethPrivateKeySchema.parse(k.getValue()))
    : [];

  // There must be at least 1.
  if (publisherKeys.length === 0) {
    return undefined;
  }

  // If we have a valid proverId then create a prover key store of the form { id, publisher: [publisherKeys] }
  // Otherwise create one of the form ("0x12345678....." as EthAccount).

  const keyStore: KeyStore = {
    schemaVersion: 1,
    slasher: undefined,
    prover:
      config.proverId === undefined
        ? publisherKeys[0]
        : {
            id: config.proverId,
            publisher: publisherKeys,
          },
    remoteSigner: undefined,
    validators: undefined,
  };
  return keyStore;
}

export function createKeyStoreForProver(config: ProverNodeConfig): KeyStore | undefined {
  if (config.web3SignerUrl !== undefined && config.web3SignerUrl.length > 0) {
    const keyStore = createKeyStoreFromWeb3Signer(config);
    if (keyStore) {
      return keyStore;
    }
  }

  return createKeyStoreFromPublisherKeys(config);
}
