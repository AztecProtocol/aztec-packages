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
    OperandType.UINT32, // p1
    OperandType.UINT32, // p2
    OperandType.UINT32, // dst
  ];

  constructor(private indirect: number, private p1Offset: number, private p2Offset: number, private dstOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memoryOperations = { reads: 4, writes: 2, indirect: this.indirect };
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost(memoryOperations));

    memory.checkTags(TypeTag.FIELD, this.p1Offset, this.p2Offset);

    const p1X = memory.get(this.p1Offset);
    const p1Y = memory.get(this.p1Offset + 1);
    const p1 = new Point(p1X.toFr(), p1Y.toFr());
    if (!p1.is_on_grumpkin()) {
      throw new Error(`Point1 at offset ${this.p1Offset} is not on the curve`);
    }

    const p2X = memory.get(this.p2Offset);
    const p2Y = memory.get(this.p2Offset + 1);
    const p2 = new Point(p2X.toFr(), p2Y.toFr());
    if (!p2.is_on_grumpkin()) {
      throw new Error(`Point2 at offset ${this.p2Offset} is not on the curve`);
    }

    const dest = p1.add(p2);
    memory.set(this.dstOffset, new Field(dest.x));
    memory.set(this.dstOffset + 1, new Field(dest.y));

    memory.assert(memoryOperations);
    context.machineState.incrementPc();
  }

  protected override gasCost(memoryOps: Partial<MemoryOperations & { indirect: number }>) {
    const baseGasCost = getGasCostForTypeTag(TypeTag.FIELD, getBaseGasCost(this.opcode));
    const memoryGasCost = getMemoryGasCost(memoryOps);
    return sumGas(baseGasCost, memoryGasCost);
  }
}
