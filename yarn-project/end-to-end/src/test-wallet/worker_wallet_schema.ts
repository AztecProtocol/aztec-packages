import { ExecutionPayloadSchema, SendOptionsSchema, WalletSchema } from '@aztec/aztec.js/wallet';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { schemas } from '@aztec/foundation/schemas';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tx } from '@aztec/stdlib/tx';

import { z } from 'zod';

/** Schema for the WorkerWallet API — extends WalletSchema with proveTx and registerAccount. */
export const WorkerWalletSchema: ApiSchema = {
  ...WalletSchema,
  proveTx: z.function({ input: z.tuple([ExecutionPayloadSchema, SendOptionsSchema]), output: Tx.schema }),
  registerAccount: z.function({ input: z.tuple([schemas.Fr, schemas.Fr, schemas.Fq]), output: AztecAddress.schema }),
};
