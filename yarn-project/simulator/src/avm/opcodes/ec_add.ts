import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { Point } from '@aztec/foundation/fields';

import { type AvmContext } from '../avm_context.js';
import { getBaseGasCost, getGasCostForTypeTag, getMemoryGasCost, sumGas } from '../avm_gas.js';
import { Field, MemoryOperations, TypeTag } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';

export class EcAdd extends Instruction {
  static type: string = 'ECADD';
  static readonly opcode = Opcode.ECADD;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // reserved
    OperandType.UINT8, // indirect
    OperandType.UINT32, // p1X
    OperandType.UINT32, // p1Y
    OperandType.UINT8, // p1IsInfinite
    OperandType.UINT32, // p2X
    OperandType.UINT32, // p2Y
    OperandType.UINT8, // p2IsInfinite
    OperandType.UINT32, // dst
  ];

  constructor(
    private indirect: number,
    private p1X: number,
    private p1Y: number,
    private p1IsInfinite: number,
    private p2X: number,
    private p2Y: number,
    private p2IsInfinite: number,
    private dstOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memoryOperations = { reads: 5, writes: 3, indirect: this.indirect };
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost(memoryOperations));

    memory.checkTags(TypeTag.FIELD, this.p1X, this.p1Y, this.p2X, this.p2Y);
    memory.checkTags(TypeTag.UINT8, this.p1IsInfinite, this.p2IsInfinite);

    const p1X = memory.get(this.p1X);
    const p1Y = memory.get(this.p1Y);
    // unused. Point doesn't store this information
    // const p1IsInfinite = memory.get(this.p1IsInfinite);
    const p1 = new Point(p1X.toFr(), p1Y.toFr());
    if (!p1.isOnGrumpkin()) {
      throw new Error(`Point1 is not on the curve`);
    }

    const p2X = memory.get(this.p2X);
    const p2Y = memory.get(this.p2Y);
    // unused. Point doesn't store this information
    // const p2IsInfinite = memory.get(this.p2IsInfinite);
    const p2 = new Point(p2X.toFr(), p2Y.toFr());
    if (!p2.isOnGrumpkin()) {
      throw new Error(`Point1 is not on the curve`);
    }

    // const dest = p1.add(p2);
    const grumpkin = new Grumpkin();
    const dest = grumpkin.add(p1, p2);
    const dstOffsetResolved = Number(memory.get(this.dstOffset).toBigInt());

    memory.set(dstOffsetResolved, new Field(dest.x));
    memory.set(dstOffsetResolved + 1, new Field(dest.y));
    memory.set(dstOffsetResolved + 2, new Field(dest.equals(Point.ZERO) ? 1 : 0));

    memory.assert(memoryOperations);
    context.machineState.incrementPc();
  }

  protected override gasCost(memoryOps: Partial<MemoryOperations & { indirect: number }>) {
    const baseGasCost = getGasCostForTypeTag(TypeTag.FIELD, getBaseGasCost(this.opcode));
    const memoryGasCost = getMemoryGasCost(memoryOps);
    return sumGas(baseGasCost, memoryGasCost);
  }
}
