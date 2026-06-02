import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Point } from '@aztec/foundation/curves/grumpkin';

import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag } from '../avm_memory_types.js';
import { EcAddPointNotOnCurveError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class EcAdd extends Instruction {
  static type: string = 'ECADD';
  static readonly opcode = Opcode.ECADD;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // reserved
    OperandType.UINT16, // indirect
    OperandType.UINT16, // p1X
    OperandType.UINT16, // p1Y
    OperandType.UINT16, // p2X
    OperandType.UINT16, // p2Y
    OperandType.UINT16, // dst
  ];

  constructor(
    private addressingMode: number,
    private p1XOffset: number,
    private p1YOffset: number,
    private p2XOffset: number,
    private p2YOffset: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.addressingMode);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.p1XOffset, this.p1YOffset, this.p2XOffset, this.p2YOffset, this.dstOffset];
    const [p1XOffset, p1YOffset, p2XOffset, p2YOffset, dstOffset] = addressing.resolve(operands, memory);

    memory.checkTags(TypeTag.FIELD, p1XOffset, p1YOffset, p2XOffset, p2YOffset);

    const p1X = memory.get(p1XOffset);
    const p1Y = memory.get(p1YOffset);
    const p1 = new Point(p1X.toFr(), p1Y.toFr());
    if (!p1.isOnCurve()) {
      throw new EcAddPointNotOnCurveError(/*pointIndex=*/ 1, p1);
    }

    const p2X = memory.get(p2XOffset);
    const p2Y = memory.get(p2YOffset);
    const p2 = new Point(p2X.toFr(), p2Y.toFr());
    if (!p2.isOnCurve()) {
      throw new EcAddPointNotOnCurveError(/*pointIndex=*/ 2, p2);
    }

    let dest;
    if (p1.isInfinite && p2.isInfinite) {
      dest = Point.INFINITY;
    } else if (p1.isInfinite) {
      dest = p2;
    } else if (p2.isInfinite) {
      dest = p1;
    } else {
      // TS<>BB ecc add communication is broken for points that add up to infinity.
      // However, here we know that both points are on the curve, and that none is infinity
      // so we can check for the case where you add p + (-p) = infinity.
      if (p1.x.equals(p2.x) && !p1.y.equals(p2.y)) {
        dest = Point.INFINITY;
      } else {
        dest = await Grumpkin.add(p1, p2);
      }
    }

    // Important to use setSlice() and not set() in the two following statements as
    // this checks that the offsets lie within memory range.
    memory.setSlice(dstOffset, [new Field(dest.x), new Field(dest.y)]);
  }
}
