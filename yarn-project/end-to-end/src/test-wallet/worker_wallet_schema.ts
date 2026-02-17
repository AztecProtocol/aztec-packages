import { ExecutionPayloadSchema, SendOptionsSchema, WalletSchema } from '@aztec/aztec.js/wallet';
import { schemas } from '@aztec/foundation/schemas';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tx } from '@aztec/stdlib/tx';

import { z } from 'zod';

/** Schema for the WorkerWallet API — extends WalletSchema with proveTx and registerAccount. */
export const WorkerWalletSchema = {
  ...WalletSchema,
  proveTx: z.function().args(ExecutionPayloadSchema, SendOptionsSchema).returns(Tx.schema),
  registerAccount: z.function().args(schemas.Fr, schemas.Fr).returns(AztecAddress.schema),
};
