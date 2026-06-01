import { BarretenbergSync, CircuitKind } from '@aztec/bb.js';

import { Fr } from '../../curves/bn254/field.js';

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
    default: {
      const _exhaustive: never = kind;
      throw new Error(`vkAsFields: unhandled CircuitKind ${_exhaustive}`);
    }
  }
}
