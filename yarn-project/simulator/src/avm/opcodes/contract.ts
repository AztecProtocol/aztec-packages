import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint1 } from '../avm_memory_types.js';
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
    OperandType.UINT8, // indirect bits
    OperandType.UINT8, // indirect bits
    OperandType.UINT8, // member enum (immediate)
    OperandType.UINT16, // addressOffset
    OperandType.UINT16, // dstOffset
    OperandType.UINT16, // existsOfsset
  ];

  constructor(private indirect: number, private memberEnum: ContractInstanceMember, private addressOffset: number, private dstOffset: number, private existsOffset: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.addressOffset, this.dstOffset, this.existsOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [addressOffset, dstOffset, existsOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, addressOffset);

    const address = memory.get(addressOffset).toFr();
    const [exists, instance] = await context.persistableState.getContractInstance(address);

    const memberValue = this.memberEnum === ContractInstanceMember.DEPLOYER
      ? instance.deployer.toField()
      : this.memberEnum === ContractInstanceMember.CLASS_ID
      ? instance.contractClassId
      : instance.initializationHash; // memberEnum === ContractInstanceMember.INIT_HASH

    memory.set(existsOffset, new Uint1(exists ? 1 : 0));
    memory.set(dstOffset, exists ? new Field(memberValue) : new Field(0));
    // TODO(dbanks12): anything left to do here for tags?

    memory.assert({ reads: 1, writes: 2, addressing });
    context.machineState.incrementPc();
  }
}
