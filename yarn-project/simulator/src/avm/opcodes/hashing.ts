import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { keccak, pedersenHash, poseidonHash, sha256 } from '@aztec/foundation/crypto';

import { AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

export class Poseidon2 extends Instruction {
  static type: string = 'POSEIDON2';
  static readonly opcode: Opcode = Opcode.POSEIDON;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private destOffset: number, private hashOffset: number, private hashSize: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    // We hash a set of field elements
    // TODO: types are going through buffers to deal with two different Fr types in bb.js and foundation
    const hashDataBigint = context.machineState.memory
      .getSlice(this.hashOffset, this.hashOffset + this.hashSize)
      .map(word => word.toBigInt());

    // We give each field 32 bytes of space
    const hashData = hashDataBigint.map(bigint => toBufferBE(bigint, 32));

    // Yucky casting
    const hash = poseidonHash(hashData);
    context.machineState.memory.set(this.destOffset, new Field(toBigIntBE(hash)));

    context.machineState.incrementPc();
  }
}

export class Keccak extends Instruction {
  static type: string = 'KECCAK';
  static readonly opcode: Opcode = Opcode.KECCAK;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private destOffset: number, private hashOffset: number, private hashSize: number) {
    super();
  }

  // Note hash output is 32 bytes, so takes up two fields
  async execute(context: AvmContext): Promise<void> {
    // We hash a set of field elements
    const hashDataBigint = context.machineState.memory
      .getSlice(this.hashOffset, this.hashOffset + this.hashSize)
      .map(word => word.toBigInt());

    // TODO: one hashing api takes an array of buffers, the other one big buffer wtf?
    const hashData = Buffer.concat(hashDataBigint.map(bigint => toBufferBE(bigint, 32)));
    const hash = keccak(hashData);

    // Split output into two fields
    const high = new Field(toBigIntBE(hash.subarray(0, 16)));
    const low = new Field(toBigIntBE(hash.subarray(16, 32)));

    context.machineState.memory.set(this.destOffset, high);
    context.machineState.memory.set(this.destOffset + 1, low);

    context.machineState.incrementPc();
  }
}

export class Sha256 extends Instruction {
  static type: string = 'SHA256';
  static readonly opcode: Opcode = Opcode.SHA256;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private destOffset: number, private hashOffset: number, private hashSize: number) {
    super();
  }

  // Note hash output is 32 bytes, so takes up two fields
  async execute(context: AvmContext): Promise<void> {
    // We hash a set of field elements
    const hashDataBigint = context.machineState.memory
      .getSlice(this.hashOffset, this.hashOffset + this.hashSize)
      .map(word => word.toBigInt());

    // TODO: one hashing api takes an array of buffers, the other one big buffer wtf?
    const hashData = Buffer.concat(hashDataBigint.map(bigint => toBufferBE(bigint, 32)));
    const hash = sha256(hashData);

    // Split output into two fields
    const high = new Field(toBigIntBE(hash.subarray(0, 16)));
    const low = new Field(toBigIntBE(hash.subarray(16, 32)));

    context.machineState.memory.set(this.destOffset, high);
    context.machineState.memory.set(this.destOffset + 1, low);

    context.machineState.incrementPc();
  }
}

export class Pedersen extends Instruction {
  static type: string = 'PEDERSEN';
  static readonly opcode: Opcode = Opcode.PEDERSEN;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private destOffset: number, private hashOffset: number, private hashSize: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    // We hash a set of field elements
    // TODO: types are going through buffers to deal with two different Fr types in bb.js and foundation
    const hashDataBigint = context.machineState.memory
      .getSlice(this.hashOffset, this.hashOffset + this.hashSize)
      .map(word => word.toBigInt());

    // We give each field 32 bytes of space
    const hashData = hashDataBigint.map(bigint => toBufferBE(bigint, 32));

    // yucky casting
    // No domain sep for now
    const hash = pedersenHash(hashData);
    context.machineState.memory.set(this.destOffset, new Field(toBigIntBE(hash)));

    context.machineState.incrementPc();
  }
}
