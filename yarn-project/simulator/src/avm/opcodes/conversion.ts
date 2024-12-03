import { type AvmContext } from '../avm_context.js';
import { TypeTag, Uint1, Uint8 } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class ToRadixBE extends Instruction {
  static type: string = 'TORADIXLE';
  static readonly opcode: Opcode = Opcode.TORADIXBE;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // Opcode
    OperandType.UINT8, // Indirect
    OperandType.UINT16, // src memory address
    OperandType.UINT16, // dst memory address
    OperandType.UINT16, // radix memory address
    OperandType.UINT16, // number of limbs (Immediate)
    OperandType.UINT8, // output is in "bits" mode (Immediate - Uint1 still takes up a whole byte)
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
    const operands = [this.srcOffset, this.dstOffset, this.radixOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [srcOffset, dstOffset, radixOffset] = addressing.resolve(operands, memory);
    context.machineState.consumeGas(this.gasCost(this.numLimbs));

    // The radix gadget only takes in a Field
    memory.checkTag(TypeTag.FIELD, srcOffset);
    memory.checkTag(TypeTag.UINT32, radixOffset);

    let value: bigint = memory.get(srcOffset).toBigInt();
    const radix: bigint = memory.get(radixOffset).toBigInt();
    if (this.numLimbs < 1) {
      throw new InstructionExecutionError(`ToRadixBE instruction's numLimbs should be > 0 (was ${this.numLimbs})`);
    }
    if (radix > 256) {
      throw new InstructionExecutionError(`ToRadixBE instruction's radix should be <= 256 (was ${radix})`);
    }
    const radixBN: bigint = BigInt(radix);
    const limbArray = new Array(this.numLimbs);

    for (let i = this.numLimbs - 1; i >= 0; i--) {
      const limb = value % radixBN;
      limbArray[i] = limb;
      value /= radixBN;
    }

    const outputType = this.outputBits != 0 ? Uint1 : Uint8;
    const res = limbArray.map(byte => new outputType(byte));
    memory.setSlice(dstOffset, res);

    memory.assert({ reads: 2, writes: this.numLimbs, addressing });
  }
}
