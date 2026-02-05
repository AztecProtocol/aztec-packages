import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag } from '../avm_memory_types.js';
import { StaticCallAlterationError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class SStore extends Instruction {
  static readonly type: string = 'SSTORE';
  static readonly opcode = Opcode.SSTORE;
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private slotOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.addressingMode);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.srcOffset, this.slotOffset];
    const [srcOffset, slotOffset] = addressing.resolve(operands, memory);
    // We read before tag checking since it's needed for gas cost calculation
    const slot = memory.get(slotOffset).toFr();

    context.machineState.consumeGas(
      this.dynamicGasCost(Number(context.persistableState.isStorageCold(context.environment.address, slot))),
    );

    memory.checkTag(TypeTag.FIELD, slotOffset);
    memory.checkTag(TypeTag.FIELD, srcOffset);

    const value = memory.get(srcOffset).toFr();
    await context.persistableState.writeStorage(context.environment.address, slot, value);
  }
}

export class SLoad extends Instruction {
  static readonly type: string = 'SLOAD';
  static readonly opcode = Opcode.SLOAD;
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private slotOffset: number,
    private contractAddressOffset: number,
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

    const operands = [this.slotOffset, this.contractAddressOffset, this.dstOffset];
    const [slotOffset, contractAddressOffset, dstOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, slotOffset);
    memory.checkTag(TypeTag.FIELD, contractAddressOffset);

    const slot = memory.get(slotOffset).toFr();
    const contractAddress = memory.get(contractAddressOffset).toAztecAddress();
    const value = await context.persistableState.readStorage(contractAddress, slot);
    memory.set(dstOffset, new Field(value));
  }
}
