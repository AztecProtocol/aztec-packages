import { type AvmContext } from '../avm_context.js';
import { TypeTag, Uint1, Uint8 } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class ToRadixLE extends Instruction {
  static type: string = 'TORADIXLE';
  static readonly opcode: Opcode = Opcode.TORADIXLE;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // Opcode
    OperandType.UINT8, // Indirect
    OperandType.UINT32, // src memory address
    OperandType.UINT32, // dst memory address
    OperandType.UINT32, // radix memory address
    OperandType.UINT32, // number of limbs (Immediate)
    OperandType.UINT1, // output is in "bits" mode (Immediate - Uint1 still takes up a whole byte)
  ];

  constructor(
    private indirect: number,
    private srcOffset: number,
    private dstOffset: number,
    private radixOffset: number,
    private numLimbs: number,
    private outputBits: number, // effectively a bool
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    const [srcOffset, dstOffset, radixOffset] = Addressing.fromWire(this.indirect).resolve(
      [this.srcOffset, this.dstOffset, this.radixOffset],
      memory,
    );
    const memoryOperations = { reads: 2, writes: this.numLimbs, indirect: this.indirect };
    context.machineState.consumeGas(this.gasCost({ ...memoryOperations, dynMultiplier: this.numLimbs }));

    // The radix gadget only takes in a Field
    memory.checkTag(TypeTag.FIELD, srcOffset);
    memory.checkTag(TypeTag.UINT32, radixOffset);

    let value: bigint = memory.get(srcOffset).toBigInt();
    const radix: bigint = memory.get(radixOffset).toBigInt();
    if (radix > 256) {
      throw new InstructionExecutionError(`ToRadixLE instruction's radix should be <= 256 (was ${radix})`);
    }
    const radixBN: bigint = BigInt(radix);
    const limbArray = [];

    for (let i = 0; i < this.numLimbs; i++) {
      const limb = value % radixBN;
      limbArray.push(limb);
      value /= radixBN;
    }

    const outputType = this.outputBits != 0 ? Uint1 : Uint8;
    const res = limbArray.map(byte => new outputType(byte));
    memory.setSlice(dstOffset, res);

    memory.assert(memoryOperations);
    context.machineState.incrementPc();
  }
}
