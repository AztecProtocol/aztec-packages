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
    OperandType.UINT8, // indirect bits
    OperandType.UINT16, // addressOffset
    OperandType.UINT16, // dstOffset
    OperandType.UINT16, // existsOfsset
    OperandType.UINT8, // member enum (immediate)
  ];

  constructor(
    private indirect: number,
    private addressOffset: number,
    private dstOffset: number,
    private existsOffset: number,
    private memberEnum: number,
  ) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    if (!(this.memberEnum in ContractInstanceMember)) {
      throw new InstructionExecutionError(`Invalid GETCONSTRACTINSTANCE member enum ${this.memberEnum}`);
    }

    const operands = [this.addressOffset, this.dstOffset, this.existsOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [addressOffset, dstOffset, existsOffset] = addressing.resolve(operands, memory);
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
          memberValue = new Field(instance.contractClassId.toField());
          break;
        case ContractInstanceMember.INIT_HASH:
          memberValue = new Field(instance.initializationHash);
          break;
      }
    }

    memory.set(existsOffset, new Uint1(exists ? 1 : 0));
    memory.set(dstOffset, memberValue);

    memory.assert({ reads: 1, writes: 2, addressing });
  }
}
