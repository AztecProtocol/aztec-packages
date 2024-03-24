import { sequencerConfig } from '@aztec/circuit-types';
import { stringlyNumber, z } from '@aztec/foundation/zod';

import { globalReaderConfig } from './global_variable_builder/config.js';
import { publisherConfig, txSenderConfig } from './publisher/config.js';

/** Chain configuration. */
const chainConfig = z.object({
  /** The chain id of the ethereum host. */
  chainId: stringlyNumber.default(31337), // 31337 is the default chain id for anvil
  /** The version of the rollup. */
  version: stringlyNumber.default(1), // 1 is our default version
});

const sequencerClientConfig = publisherConfig
  .merge(txSenderConfig)
  .merge(sequencerConfig)
  .merge(globalReaderConfig)
  .merge(chainConfig);

/**
 * Configuration settings for the SequencerClient.
 */
export type SequencerClientConfig = z.infer<typeof sequencerClientConfig>;

/**
 * Creates an instance of SequencerClientConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getConfigEnvVars(): SequencerClientConfig {
  const {
    SEQ_PUBLISHER_PRIVATE_KEY: publisherPrivateKey,
    ETHEREUM_HOST: rpcUrl,
    CHAIN_ID: chainId,
    VERSION: version,
    API_KEY: apiKey,
    SEQ_REQUIRED_CONFIRMATIONS: requiredConfirmations,
    SEQ_PUBLISH_RETRY_INTERVAL_MS: l1BlockPublishRetryIntervalMS,
    SEQ_TX_POLLING_INTERVAL_MS: transactionPollingIntervalMS,
    SEQ_MAX_TX_PER_BLOCK: maxTxsPerBlock,
    SEQ_MIN_TX_PER_BLOCK: minTxsPerBlock,
    SEQ_FPC_CLASSES: allowedFeePaymentContractClasses,
    SEQ_FPC_INSTANCES: allowedFeePaymentContractInstances,
    AVAILABILITY_ORACLE_CONTRACT_ADDRESS: availabilityOracleAddress,
    ROLLUP_CONTRACT_ADDRESS: rollupAddress,
    REGISTRY_CONTRACT_ADDRESS: registryAddress,
    INBOX_CONTRACT_ADDRESS: inboxAddress,
    OUTBOX_CONTRACT_ADDRESS: outboxAddress,
    GAS_TOKEN_CONTRACT_ADDRESS: gasTokenAddress,
    GAS_PORTAL_CONTRACT_ADDRESS: gasPortalAddress,
    COINBASE: coinbase,
    FEE_RECIPIENT: feeRecipient,
    ACVM_WORKING_DIRECTORY: acvmWorkingDirectory,
    ACVM_BINARY_PATH: acvmBinaryPath,
  } = process.env;

  return sequencerClientConfig.parse({
    rpcUrl,
    chainId,
    version,
    apiKey,
    requiredConfirmations,
    l1BlockPublishRetryIntervalMS,
    transactionPollingIntervalMS,
    l1Contracts: {
      availabilityOracleAddress,
      rollupAddress,
      registryAddress,
      inboxAddress,
      outboxAddress,
      gasTokenAddress,
      gasPortalAddress,
    },
    publisherPrivateKey,
    maxTxsPerBlock,
    minTxsPerBlock,
    allowedFeePaymentContractClasses,
    allowedFeePaymentContractInstances,
    coinbase,
    feeRecipient,
    acvmWorkingDirectory,
    acvmBinaryPath,
  });
}
