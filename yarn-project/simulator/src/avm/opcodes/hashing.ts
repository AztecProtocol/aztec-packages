import { keccakf1600, poseidon2Permutation, sha256Compression } from '@aztec/foundation/crypto';

import { type AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint32, Uint64 } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class Poseidon2 extends Instruction {
  static type: string = 'POSEIDON2';
  static readonly opcode: Opcode = Opcode.POSEIDON2;
  static readonly stateSize = 4;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private inputStateOffset: number, private outputStateOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.inputStateOffset, this.outputStateOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [inputOffset, outputOffset] = addressing.resolve(operands, memory);
    memory.checkTagsRange(TypeTag.FIELD, inputOffset, Poseidon2.stateSize);

    const inputState = memory.getSlice(inputOffset, Poseidon2.stateSize);
    const outputState = poseidon2Permutation(inputState);
    memory.setSlice(
      outputOffset,
      outputState.map(word => new Field(word)),
    );

    memory.assert({ reads: Poseidon2.stateSize, writes: Poseidon2.stateSize, addressing });
  }
}

export class KeccakF1600 extends Instruction {
  static type: string = 'KECCAKF1600';
  static readonly opcode: Opcode = Opcode.KECCAKF1600;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private dstOffset: number, private inputOffset: number) {
    super();
  }

  // pub fn keccakf1600(input: [u64; 25]) -> [u64; 25]
  public async execute(context: AvmContext): Promise<void> {
    const inputSize = 25;
    const memory = context.machineState.memory.track(this.type);
    const operands = [this.dstOffset, this.inputOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [dstOffset, inputOffset] = addressing.resolve(operands, memory);
    context.machineState.consumeGas(this.gasCost());

    memory.checkTagsRange(TypeTag.UINT64, inputOffset, inputSize);

    const stateData = memory.getSlice(inputOffset, inputSize).map(word => word.toBigInt());
    const updatedState = keccakf1600(stateData);

    const res = updatedState.map(word => new Uint64(word));
    memory.setSlice(dstOffset, res);

    memory.assert({ reads: inputSize, writes: inputSize, addressing });
  }
}

export class Sha256Compression extends Instruction {
  static type: string = 'SHA256COMPRESSION';
  static readonly opcode: Opcode = Opcode.SHA256COMPRESSION;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private indirect: number,
    private outputOffset: number,
    private stateOffset: number,
    private inputsOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const STATE_SIZE = 8;
    const INPUTS_SIZE = 16;

    const memory = context.machineState.memory.track(this.type);
    const operands = [this.outputOffset, this.stateOffset, this.inputsOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [outputOffset, stateOffset, inputsOffset] = addressing.resolve(operands, memory);

    // Note: size of output is same as size of state
    context.machineState.consumeGas(this.gasCost());
    memory.checkTagsRange(TypeTag.UINT32, inputsOffset, INPUTS_SIZE);
    memory.checkTagsRange(TypeTag.UINT32, stateOffset, STATE_SIZE);

    const state = Uint32Array.from(memory.getSlice(stateOffset, STATE_SIZE).map(word => word.toNumber()));
    const inputs = Uint32Array.from(memory.getSlice(inputsOffset, INPUTS_SIZE).map(word => word.toNumber()));
    const output = sha256Compression(state, inputs);

    // Conversion required from Uint32Array to Uint32[] (can't map directly, need `...`)
    const res = [...output].map(word => new Uint32(word));
    memory.setSlice(outputOffset, res);

    memory.assert({ reads: STATE_SIZE + INPUTS_SIZE, writes: STATE_SIZE, addressing });
  }
}
