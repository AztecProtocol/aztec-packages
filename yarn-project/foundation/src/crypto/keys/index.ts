import { BarretenbergSync, CircuitKind } from '@aztec/bb.js';

import { Fr } from '../../curves/bn254/field.js';

/**
 * Convert a Chonk verification key (serialized bytes) to its field-element representation.
 *
 * Each slim Mega flavor has a distinct VK size, so the kind tag is required: calling this with the
 * wrong kind silently mis-deserializes. The kind should come from the artifact that pinned the VK
 * (e.g. the per-circuit kind in `chonk_circuits.json` for protocol circuits).
 */
export async function vkAsFields(input: Buffer, kind: CircuitKind): Promise<Fr[]> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  switch (kind) {
    case CircuitKind.App: {
      const response = api.megaAppVkAsFields({ verificationKey: input });
      return response.fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    }
    case CircuitKind.Kernel: {
      const response = api.megaKernelVkAsFields({ verificationKey: input });
      return response.fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    }
    case CircuitKind.HidingKernel: {
      const response = api.megaZKVkAsFields({ verificationKey: input });
      return response.fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    }
  }
}
