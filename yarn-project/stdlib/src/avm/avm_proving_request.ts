import { z } from 'zod';

import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { AvmCircuitInputs } from './avm.js';

export type AvmProvingRequest = z.infer<typeof AvmProvingRequestSchema>;

export const AvmProvingRequestSchema = z.object({
  type: z.literal(ProvingRequestType.PUBLIC_VM),
  inputs: AvmCircuitInputs.schema,
});
