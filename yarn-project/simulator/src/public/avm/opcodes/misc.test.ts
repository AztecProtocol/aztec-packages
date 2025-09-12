import { jest } from '@jest/globals';

import { Field, Uint8, Uint32 } from '../avm_memory_types.js';
import { initContext, initExecutionEnvironment } from '../fixtures/initializers.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { DebugLog } from './misc.js';

describe('Misc Instructions', () => {
  describe('DebugLog', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.DEBUGLOG, // opcode
        0x01, // indirect
        ...Buffer.from('1234', 'hex'), // messageOffset
        ...Buffer.from('2345', 'hex'), // fieldsOffset
        ...Buffer.from('3456', 'hex'), // fieldsSizeOffset
        ...Buffer.from('0010', 'hex'), // messageSize
      ]);
      const inst = new DebugLog(
        /*indirect=*/ 0x01,
        /*messageOffset=*/ 0x1234,
        /*fieldsOffset=*/ 0x2345,
        /*fieldsSizeOffset=*/ 0x3456,
        /*messageSize=*/ 0x0010,
      );

      // Just test that the buffer can be generated correctly
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should execute DebugLog in client-initiated simulation mode', async () => {
      const env = initExecutionEnvironment({ clientInitiatedSimulation: true });
      const context = initContext({ env });
      // Set up memory with message and fields
      const messageOffset = 10;
      const fieldsOffset = 100;
      const fieldsSizeOffset = 200;
      const fieldValue = new Field(0x42n);

      // Set up a test message "Hello {0}!"
      const message = 'Hello {0}!';
      const messageSize = message.length;
      for (let i = 0; i < messageSize; i++) {
        context.machineState.memory.set(messageOffset + i, new Uint8(BigInt(message.charCodeAt(i))));
      }

      // Set up a field value
      context.machineState.memory.set(fieldsOffset, fieldValue);
      context.machineState.memory.set(fieldsSizeOffset, new Uint32(1n)); // One field value

      // Mock verbose logger
      const mockIsVerbose = jest.spyOn(DebugLog.logger, 'isLevelEnabled').mockImplementation(() => true);
      const mockVerbose = jest.spyOn(DebugLog.logger, 'verbose').mockImplementation(() => {});

      try {
        // Execute debug log instruction
        await new DebugLog(
          /*indirect=*/ 0,
          /*messageOffset=*/ messageOffset,
          /*fieldsOffset=*/ fieldsOffset,
          /*fieldsSizeOffset=*/ fieldsSizeOffset,
          /*messageSize=*/ messageSize,
        ).execute(context);

        // Check that logger.verbose was called with formatted message
        expect(mockVerbose).toHaveBeenCalledWith(`Hello ${fieldValue.toFr()}!`);
      } finally {
        // Restore the mock
        mockIsVerbose.mockRestore();
        mockVerbose.mockRestore();
      }
    });

    it('DebugLog should be a no-op when not in client-initiated simulation mode', async () => {
      // NOT client-initiated simulation
      const env = initExecutionEnvironment({ clientInitiatedSimulation: false });
      const context = initContext({ env });
      // Set up memory with message and fields
      const messageOffset = 10;
      const fieldsOffset = 100;
      const fieldsSizeOffset = 200;
      const messageSize = 11;

      // fieldsSizeOffset still needs to be set because its tag is checked
      context.machineState.memory.set(fieldsSizeOffset, new Uint32(1n)); // One field value

      // Mock verbose logger
      const mockVerbose = jest.spyOn(DebugLog.logger, 'verbose').mockImplementation(() => {});

      try {
        // Execute debug log instruction
        await new DebugLog(
          /*indirect=*/ 0,
          /*messageOffset=*/ messageOffset,
          /*fieldsOffset=*/ fieldsOffset,
          /*fieldsSizeOffset=*/ fieldsSizeOffset,
          /*messageSize=*/ messageSize,
        ).execute(context);

        // Verify the logger was not called
        expect(mockVerbose).not.toHaveBeenCalled();
      } finally {
        // Restore the mock
        mockVerbose.mockRestore();
      }
    });
  });
});
