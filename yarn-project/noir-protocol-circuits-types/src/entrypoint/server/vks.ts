import type { VerificationKeyData } from '@aztec/stdlib/vks';

import type { ProtocolArtifact } from '../../artifacts/types.js';
import { ClientCircuitVks } from '../../artifacts/vks/client.js';
import { ServerCircuitVks } from '../../artifacts/vks/server.js';

export { ServerCircuitVks, ProtocolCircuitVkIndexes, TubeVk } from '../../artifacts/vks/server.js';
export { ClientCircuitVks } from '../../artifacts/vks/client.js';

export const ProtocolCircuitVks: Record<ProtocolArtifact, VerificationKeyData> = {
  ...ClientCircuitVks,
  ...ServerCircuitVks,
};
