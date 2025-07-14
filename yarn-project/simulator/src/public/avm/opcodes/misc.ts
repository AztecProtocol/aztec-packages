import { applyStringFormatting, createLogger } from '@aztec/foundation/log';

import type { AvmContext } from '../avm_context.js';
import { TypeTag } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class DebugLog extends Instruction {
  static type: string = 'DEBUGLOG';
  static readonly opcode: Opcode = Opcode.DEBUGLOG;
  static readonly logger = createLogger('simulator:avm:debug_log');

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
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.messageOffset, this.fieldsOffset, this.fieldsSizeOffset];
    const [messageOffset, fieldsOffset, fieldsSizeOffset] = addressing.resolve(operands, memory);

    // DebugLog is a no-op except when doing client-initiated simulation with debug logging enabled.
    // Note that we still do address resolution and basic tag-checking (above)
    // To avoid a special-case in the witness generator and circuit.
    if (context.environment.clientInitiatedSimulation && DebugLog.logger.isLevelEnabled('verbose')) {
      memory.checkTag(TypeTag.UINT32, fieldsSizeOffset);
      const fieldsSize = memory.get(fieldsSizeOffset).toNumber();

      const rawMessage = memory.getSlice(messageOffset, this.messageSize);
      const fields = memory.getSlice(fieldsOffset, fieldsSize);

      memory.checkTagsRange(TypeTag.UINT8, messageOffset, this.messageSize);
      memory.checkTagsRange(TypeTag.FIELD, fieldsOffset, fieldsSize);

      // Interpret str<N> = [u8; N] to string.
      const messageAsStr = rawMessage.map(field => String.fromCharCode(field.toNumber())).join('');
      const formattedStr = applyStringFormatting(
        messageAsStr,
        fields.map(field => field.toFr()),
      );

      DebugLog.logger.verbose(formattedStr);
    }
  }
}
