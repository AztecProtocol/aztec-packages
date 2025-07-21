import type { AvmContext } from '../avm_context.js';
import { TypeTag, Uint1, Uint8 } from '../avm_memory_types.js';
import { InvalidToRadixInputsError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class ToRadixBE extends Instruction {
  static type: string = 'TORADIXBE';
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
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.srcOffset, this.radixOffset, this.numLimbsOffset, this.outputBitsOffset, this.dstOffset];
    const [srcOffset, radixOffset, numLimbsOffset, outputBitsOffset, dstOffset] = addressing.resolve(operands, memory);

    // The radix gadget only takes in a Field
    memory.checkTag(TypeTag.FIELD, srcOffset);
    memory.checkTag(TypeTag.UINT32, radixOffset);
    memory.checkTag(TypeTag.UINT32, numLimbsOffset);
    memory.checkTag(TypeTag.UINT1, outputBitsOffset);

    const numLimbs = memory.get(numLimbsOffset).toNumber();
    const radix: bigint = memory.get(radixOffset).toBigInt();
    context.machineState.consumeGas(
      this.dynamicGasCost(Math.max(numLimbs, radix > 256n ? 32 : MODULUS_LIMBS_PER_RADIX[Number(radix)])),
    );
    const outputBits = memory.get(outputBitsOffset).toNumber();

    let value: bigint = memory.get(srcOffset).toBigInt();

    if (radix < 2 || radix > 256) {
      throw new InvalidToRadixInputsError(`ToRadixBE instruction's radix should be in range [2,256] (was ${radix}).`);
    }

    if (numLimbs < 1 && value != BigInt(0n)) {
      throw new InvalidToRadixInputsError(
        `ToRadixBE instruction's input value is not zero (was ${value}) but numLimbs zero.`,
      );
    }

    if (outputBits != 0 && radix != BigInt(2n)) {
      throw new InvalidToRadixInputsError(`Radix ${radix} is not equal to 2 and bit mode is activated.`);
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
  }
}

// First two are for radix = 0 and 1, which are invalid, so we have 0 limbs for those cases.
export const MODULUS_LIMBS_PER_RADIX: number[] = [
  0, 0, 254, 161, 127, 110, 99, 91, 85, 81, 77, 74, 71, 69, 67, 65, 64, 63, 61, 60, 59, 58, 57, 57, 56, 55, 54, 54, 53,
  53, 52, 52, 51, 51, 50, 50, 50, 49, 49, 48, 48, 48, 48, 47, 47, 47, 46, 46, 46, 46, 45, 45, 45, 45, 45, 44, 44, 44,
  44, 44, 43, 43, 43, 43, 43, 43, 42, 42, 42, 42, 42, 42, 42, 41, 41, 41, 41, 41, 41, 41, 41, 41, 40, 40, 40, 40, 40,
  40, 40, 40, 40, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38,
  37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36,
  36, 36, 36, 36, 36, 36, 36, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35,
  35, 35, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34,
  34, 34, 34, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33,
  33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
];
