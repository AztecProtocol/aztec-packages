import { Fr } from '@aztec/circuits.js';

import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class GetContractInstance extends Instruction {
  static readonly type: string = 'GETCONTRACTINSTANCE';
  static readonly opcode: Opcode = Opcode.GETCONTRACTINSTANCE;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private indirect: number, private addressOffset: number, private dstOffset: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost());

    const operands = [this.addressOffset, this.dstOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [addressOffset, dstOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, addressOffset);

    const address = memory.get(addressOffset).toFr();
    const instance = await context.persistableState.getContractInstance(address);

    const data = [
      new Fr(instance.exists),
      instance.salt,
      instance.deployer.toField(),
      instance.contractClassId,
      instance.initializationHash,
      // This this okay ?
      ...instance.publicKeys.toFields(),
    ].map(f => new Field(f));

    memory.setSlice(dstOffset, data);

    memory.assert({ reads: 1, writes: 6, addressing });
    context.machineState.incrementPc();
  }
}
