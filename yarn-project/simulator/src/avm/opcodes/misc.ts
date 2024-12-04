import { applyStringFormatting, createLogger } from '@aztec/foundation/log';

import { type AvmContext } from '../avm_context.js';
import { TypeTag } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class DebugLog extends Instruction {
  static type: string = 'DEBUGLOG';
  static readonly opcode: Opcode = Opcode.DEBUGLOG;
  static readonly logger = createLogger('avm_simulator:debug_log');

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // Opcode
    OperandType.UINT8, // Indirect
    OperandType.UINT16, // message memory address
    OperandType.UINT16, // fields memory address
    OperandType.UINT16, // fields size address
    OperandType.UINT16, // message size
  ];

  constructor(
    private indirect: number,
    private messageOffset: number,
    private fieldsOffset: number,
    private fieldsSizeOffset: number,
    private messageSize: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);
    const operands = [this.messageOffset, this.fieldsOffset, this.fieldsSizeOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [messageOffset, fieldsOffset, fieldsSizeOffset] = addressing.resolve(operands, memory);

    memory.checkTag(TypeTag.UINT32, fieldsSizeOffset);
    const fieldsSize = memory.get(fieldsSizeOffset).toNumber();
    memory.checkTagsRange(TypeTag.UINT8, messageOffset, this.messageSize);
    memory.checkTagsRange(TypeTag.FIELD, fieldsOffset, fieldsSize);

    context.machineState.consumeGas(this.gasCost(this.messageSize + fieldsSize));

    const rawMessage = memory.getSlice(messageOffset, this.messageSize);
    const fields = memory.getSlice(fieldsOffset, fieldsSize);

    // Interpret str<N> = [u8; N] to string.
    const messageAsStr = rawMessage.map(field => String.fromCharCode(field.toNumber())).join('');
    const formattedStr = applyStringFormatting(
      messageAsStr,
      fields.map(field => field.toFr()),
    );

    DebugLog.logger.verbose(formattedStr);

    memory.assert({ reads: 1 + fieldsSize + this.messageSize, addressing });
  }
}
