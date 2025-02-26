import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { ContractInstanceUpdate } from './interfaces/contract_instance_update.js';

export class SerializableContractInstanceUpdate {
  prevContractClassId: Fr;
  newContractClassId: Fr;
  blockOfChange: number;

  constructor(instance: ContractInstanceUpdate) {
    this.prevContractClassId = instance.prevContractClassId;
    this.newContractClassId = instance.newContractClassId;
    this.blockOfChange = instance.blockOfChange;
  }

  public toBuffer() {
    return serializeToBuffer(this.prevContractClassId, this.newContractClassId, this.blockOfChange);
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader) {
    const reader = BufferReader.asReader(bufferOrReader);
    return new SerializableContractInstanceUpdate({
      prevContractClassId: reader.readObject(Fr),
      newContractClassId: reader.readObject(Fr),
      blockOfChange: reader.readNumber(),
    });
  }

  static random(opts: Partial<FieldsOf<ContractInstanceUpdate>> = {}) {
    return new SerializableContractInstanceUpdate({
      prevContractClassId: Fr.random(),
      newContractClassId: Fr.random(),
      blockOfChange: Math.floor(Math.random() * 1000),
      ...opts,
    });
  }

  static default() {
    return new SerializableContractInstanceUpdate({
      prevContractClassId: Fr.zero(),
      newContractClassId: Fr.zero(),
      blockOfChange: 0,
    });
  }
}
