import { createLogger } from '@aztec/aztec.js/log';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

const logger = createLogger('e2e:k8s-utils');

const testConfigSchema = z.object({
  NAMESPACE: z.string().default('scenario'),
  REAL_VERIFIER: schemas.Boolean.optional().default(true),
  DEBUG_FORCE_TX_PROOF_VERIFICATION: schemas.Boolean.optional().default(true),
  CREATE_ETH_DEVNET: schemas.Boolean.optional().default(false),
  L1_RPC_URLS_JSON: z.string().optional(),
  L1_ACCOUNT_MNEMONIC: z.string().optional(),
  AZTEC_SLOT_DURATION: z.coerce.number().optional().default(24),
  AZTEC_EPOCH_DURATION: z.coerce.number().optional().default(32),
  AZTEC_PROOF_SUBMISSION_WINDOW: z.coerce.number().optional().default(5),
  AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET: z.coerce.number().optional().default(2),
  FUNDING_PRIVATE_KEY: z.string().optional(),
  AZTEC_ADMIN_API_KEY: z.string().optional(),
});

export type TestConfig = z.infer<typeof testConfigSchema>;

export function setupEnvironment(env: unknown): TestConfig {
  const config = testConfigSchema.parse(env);
  logger.warn(`Loaded env config`, config);
  return config;
}
