import type { VerificationKeyData } from '@aztec/stdlib/vks';

import type { ProtocolCircuitName } from '../../artifacts/types.js';
import { ClientCircuitVks } from '../../artifacts/vks/client.js';
import { ServerCircuitVks } from '../../artifacts/vks/server.js';

export { ClientCircuitVks } from '../../artifacts/vks/client.js';
export { ProtocolCircuitVkIndexes, ServerCircuitVks } from '../../artifacts/vks/server.js';

export const ProtocolCircuitVks: Record<ProtocolCircuitName, VerificationKeyData> = {
  ...ClientCircuitVks,
  ...ServerCircuitVks,
};
