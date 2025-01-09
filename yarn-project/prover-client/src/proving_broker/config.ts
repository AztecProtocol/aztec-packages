import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

import { z } from 'zod';

export const ProverBrokerConfig = z.object({
  /** If starting a prover broker locally, the max number of retries per proving job */
  proverBrokerJobMaxRetries: z.number(),
  /** If starting a prover broker locally, the time after which a job times out and gets assigned to a different agent */
  proverBrokerJobTimeoutMs: z.number(),
  /** If starting a prover broker locally, the interval the broker checks for timed out jobs */
  proverBrokerPollIntervalMs: z.number(),
  /** If starting a prover broker locally, the directory to store broker data */
  dataDirectory: z.string().optional(),
  /** The size of the data store map */
  dataStoreMapSizeKB: z.number(),
});

export type ProverBrokerConfig = z.infer<typeof ProverBrokerConfig> &
  Pick<DataStoreConfig, 'dataStoreMapSizeKB' | 'dataDirectory'>;

export const proverBrokerConfigMappings: ConfigMappingsType<ProverBrokerConfig> = {
  proverBrokerJobTimeoutMs: {
    env: 'PROVER_BROKER_JOB_TIMEOUT_MS',
    description: 'Jobs are retried if not kept alive for this long',
    ...numberConfigHelper(30_000),
  },
  proverBrokerPollIntervalMs: {
    env: 'PROVER_BROKER_POLL_INTERVAL_MS',
    description: 'The interval to check job health status',
    ...numberConfigHelper(1_000),
  },
  proverBrokerJobMaxRetries: {
    env: 'PROVER_BROKER_JOB_MAX_RETRIES',
    description: 'If starting a prover broker locally, the max number of retries per proving job',
    ...numberConfigHelper(3),
  },
  ...dataConfigMappings,
};
