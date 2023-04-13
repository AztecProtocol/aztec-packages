import { SequencerConfig } from './sequencer/config.js';
import { PublisherConfig, TxSenderConfig } from './publisher/config.js';
import { EthAddress } from '@aztec/foundation';

export type SequencerClientConfig = PublisherConfig & TxSenderConfig & SequencerConfig;

export function getConfigEnvVars(): SequencerClientConfig {
  const {
    SEQ_PUBLISHER_PRIVATE_KEY,
    ETHEREUM_HOST,
    SEQ_REQUIRED_CONFS,
    SEQ_RETRY_INTERVAL,
    SEQ_TX_POLLING_INTERVAL,
    SEQ_MAX_TX_PER_BLOCK,
    ROLLUP_CONTRACT_ADDRESS,
    UNVERIFIED_DATA_EMITTER_ADDRESS,
  } = process.env;

  return {
    rpcUrl: ETHEREUM_HOST ? ETHEREUM_HOST : '',
    requiredConfirmations: SEQ_REQUIRED_CONFS ? +SEQ_REQUIRED_CONFS : 1,
    retryIntervalMs: SEQ_RETRY_INTERVAL ? +SEQ_RETRY_INTERVAL : 1_000,
    transactionPollingInterval: SEQ_TX_POLLING_INTERVAL ? +SEQ_TX_POLLING_INTERVAL : 1_000,
    rollupContract: EthAddress.fromString(ROLLUP_CONTRACT_ADDRESS || '0x0'),
    unverifiedDataEmitterContract: EthAddress.fromString(UNVERIFIED_DATA_EMITTER_ADDRESS || '0x0'),
    publisherPrivateKey: Buffer.from(SEQ_PUBLISHER_PRIVATE_KEY || ''),
    maxTxsPerBlock: SEQ_MAX_TX_PER_BLOCK ? +SEQ_MAX_TX_PER_BLOCK : 4,
  };
}
