import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { UInt64 } from '../types/shared.js';
import type { ContractInstanceUpdate } from './interfaces/contract_instance_update.js';

export class SerializableContractInstanceUpdate {
  prevContractClassId: Fr;
  newContractClassId: Fr;
  timestampOfChange: UInt64;

  constructor(instance: ContractInstanceUpdate) {
    this.prevContractClassId = instance.prevContractClassId;
    this.newContractClassId = instance.newContractClassId;
    this.timestampOfChange = instance.timestampOfChange;
  }

  public toBuffer() {
    return serializeToBuffer(this.prevContractClassId, this.newContractClassId, this.timestampOfChange);
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader) {
    const reader = BufferReader.asReader(bufferOrReader);
    return new SerializableContractInstanceUpdate({
      prevContractClassId: reader.readObject(Fr),
      newContractClassId: reader.readObject(Fr),
      timestampOfChange: reader.readObject(Fr).toBigInt(),
    });
  }

  static random(opts: Partial<FieldsOf<ContractInstanceUpdate>> = {}) {
    return new SerializableContractInstanceUpdate({
      prevContractClassId: Fr.random(),
      newContractClassId: Fr.random(),
      timestampOfChange: BigInt(Math.floor(Math.random() * 1000)),
      ...opts,
    });
  }

  static default() {
    return new SerializableContractInstanceUpdate({
      prevContractClassId: Fr.zero(),
      newContractClassId: Fr.zero(),
      timestampOfChange: 0n,
    });
  }
}
