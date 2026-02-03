import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint1 } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export enum ContractInstanceMember {
  DEPLOYER,
  CLASS_ID,
  INIT_HASH,
}

export class GetContractInstance extends Instruction {
  static readonly type: string = 'GETCONTRACTINSTANCE';
  static readonly opcode: Opcode = Opcode.GETCONTRACTINSTANCE;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode bits
    OperandType.UINT16, // addressOffset
    OperandType.UINT16, // dstOffset
    OperandType.UINT8, // member enum (immediate)
  ];

  constructor(
    private addressingMode: number,
    private addressOffset: number,
    private dstOffset: number,
    private memberEnum: number,
  ) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.addressingMode);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    if (!(this.memberEnum in ContractInstanceMember)) {
      throw new InstructionExecutionError(`Invalid GETCONSTRACTINSTANCE member enum ${this.memberEnum}`);
    }

    const operands = [this.addressOffset, this.dstOffset];
    const [addressOffset, dstOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, addressOffset);

    const address = memory.get(addressOffset).toAztecAddress();
    const instance = await context.persistableState.getContractInstance(address);
    const exists = instance !== undefined;

    let memberValue = new Field(0);
    if (exists) {
      switch (this.memberEnum as ContractInstanceMember) {
        case ContractInstanceMember.DEPLOYER:
          memberValue = new Field(instance.deployer.toField());
          break;
        case ContractInstanceMember.CLASS_ID:
          memberValue = new Field(instance.currentContractClassId.toField());
          break;
        case ContractInstanceMember.INIT_HASH:
          memberValue = new Field(instance.initializationHash);
          break;
      }
    }

    memory.setSlice(dstOffset, [new Uint1(exists ? 1 : 0), memberValue]);
  }
}
