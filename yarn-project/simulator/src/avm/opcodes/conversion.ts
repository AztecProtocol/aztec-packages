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
    OperandType.UINT16, // Indirect
    OperandType.UINT16, // src memory address
    OperandType.UINT16, // radix memory address
    OperandType.UINT16, // number of limbs address
    OperandType.UINT16, // output is in "bits" mode memory address (boolean/Uint1 is stored)
    OperandType.UINT16, // dst memory address
  ];

  constructor(
    private indirect: number,
    private srcOffset: number,
    private radixOffset: number,
    private numLimbsOffset: number,
    private outputBitsOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    const operands = [this.srcOffset, this.radixOffset, this.numLimbsOffset, this.outputBitsOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset] = addressing.resolve(operands, memory);

    // The radix gadget only takes in a Field
    memory.checkTag(TypeTag.FIELD, srcOffset);
    memory.checkTag(TypeTag.UINT32, radixOffset);
    memory.checkTag(TypeTag.UINT32, numLimbsOffset);
    memory.checkTag(TypeTag.UINT1, outputBitsOffset);

    const numLimbs = memory.get(numLimbsOffset).toNumber();
    context.machineState.consumeGas(this.gasCost(numLimbs));
    const outputBits = memory.get(outputBitsOffset).toNumber();

    let value: bigint = memory.get(srcOffset).toBigInt();
    const radix: bigint = memory.get(radixOffset).toBigInt();
    if (numLimbs < 1) {
      throw new InstructionExecutionError(`ToRadixBE instruction's numLimbs should be > 0 (was ${numLimbs})`);
    }
    if (radix > 256) {
      throw new InstructionExecutionError(`ToRadixBE instruction's radix should be <= 256 (was ${radix})`);
    }
    const radixBN: bigint = BigInt(radix);
    const limbArray = new Array(numLimbs);

    for (let i = numLimbs - 1; i >= 0; i--) {
      const limb = value % radixBN;
      limbArray[i] = limb;
      value /= radixBN;
    }

    const outputType = outputBits != 0 ? Uint1 : Uint8;
    const res = limbArray.map(byte => new outputType(byte));
    memory.setSlice(dstOffset, res);

    memory.assert({ reads: 4, writes: numLimbs, addressing });
  }
}
