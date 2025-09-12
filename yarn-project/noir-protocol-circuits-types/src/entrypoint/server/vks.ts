import { type VerificationKeyData, VkData } from '@aztec/stdlib/vks';

import type { ProtocolCircuitName } from '../../artifacts/types.js';
import { ClientCircuitVks } from '../../artifacts/vks/client.js';
import { ServerCircuitVks } from '../../artifacts/vks/server.js';
import { getVKIndex, getVKSiblingPath } from '../../artifacts/vks/tree.js';

export { ClientCircuitVks } from '../../artifacts/vks/client.js';
export { ProtocolCircuitVkIndexes, ServerCircuitVks } from '../../artifacts/vks/server.js';

export const ProtocolCircuitVks: Record<ProtocolCircuitName, VerificationKeyData> = {
  ...ClientCircuitVks,
  ...ServerCircuitVks,
};

export function getVkData(circuit: ProtocolCircuitName) {
  const vk = ProtocolCircuitVks[circuit];
  const leafIndex = getVKIndex(vk.keyAsFields);
  return new VkData(vk, leafIndex, getVKSiblingPath(leafIndex));
}
