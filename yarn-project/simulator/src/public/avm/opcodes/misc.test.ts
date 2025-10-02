import { LogLevels } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { PublicSideEffectTraceInterface } from '../../side_effect_trace_interface.js';
import { Field, Uint8, Uint32 } from '../avm_memory_types.js';
import { initContext, initExecutionEnvironment, initPersistableStateManager } from '../fixtures/initializers.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { DebugLog } from './misc.js';

describe('Misc Instructions', () => {
  describe('DebugLog', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        Opcode.DEBUGLOG, // opcode
        0x01, // indirect
        ...Buffer.from('0002', 'hex'), // level
        ...Buffer.from('1234', 'hex'), // messageOffset
        ...Buffer.from('2345', 'hex'), // fieldsOffset
        ...Buffer.from('3456', 'hex'), // fieldsSizeOffset
        ...Buffer.from('0010', 'hex'), // messageSize
      ]);
      const inst = new DebugLog(
        /*indirect=*/ 0x01,
        /*level=*/ 0x02,
        /*messageOffset=*/ 0x1234,
        /*fieldsOffset=*/ 0x2345,
        /*fieldsSizeOffset=*/ 0x3456,
        /*messageSize=*/ 0x0010,
      );

      // Just test that the buffer can be generated correctly
      expect(inst.toBuffer()).toEqual(buf);
    });

    it('Should execute DebugLog in client-initiated simulation mode', async () => {
      const trace = mock<PublicSideEffectTraceInterface>();
      const env = initExecutionEnvironment({ clientInitiatedSimulation: true });
      const context = initContext({ env, persistableState: initPersistableStateManager({ trace }) });

      // Set up memory with message and fields
      const levelOffset = 5;
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

      // Set up a level value
      context.machineState.memory.set(levelOffset, new Uint8(LogLevels.indexOf('verbose')));

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
          /*levelOffset=*/ levelOffset,
          /*messageOffset=*/ messageOffset,
          /*fieldsOffset=*/ fieldsOffset,
          /*fieldsSizeOffset=*/ fieldsSizeOffset,
          /*messageSize=*/ messageSize,
        ).execute(context);

        // Check that logger.verbose was called with formatted message
        expect(mockVerbose).toHaveBeenCalledWith(`Hello ${fieldValue.toFr()}!`);
        expect(trace.traceDebugLogMemoryReads).toHaveBeenCalledWith(1 + 1 + 10 + 1);
        expect(trace.traceDebugLog).toHaveBeenCalledWith(context.environment.address, 'verbose', message, [
          fieldValue.toFr(),
        ]);
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
          /*level=*/ 0,
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

    it('Should fail when max debug log memory reads is exceeded', async () => {
      const trace = mock<PublicSideEffectTraceInterface>();
      const env = initExecutionEnvironment({ clientInitiatedSimulation: true, maxDebugLogMemoryReads: 1000 });
      const context = initContext({ env, persistableState: initPersistableStateManager({ trace }) });

      const levelOffset = 5;
      const messageOffset = 10;
      const fieldsOffset = 100;
      const fieldsSizeOffset = 200;
      const fieldValue = new Field(0x42n);

      const message = 'Hello {0}!';
      const messageSize = message.length;
      for (let i = 0; i < messageSize; i++) {
        context.machineState.memory.set(messageOffset + i, new Uint8(BigInt(message.charCodeAt(i))));
      }

      context.machineState.memory.set(levelOffset, new Uint8(LogLevels.indexOf('verbose')));
      context.machineState.memory.set(fieldsOffset, fieldValue);
      context.machineState.memory.set(fieldsSizeOffset, new Uint32(1n)); // One field value

      trace.getDebugLogMemoryReads.mockReturnValue(999);

      // Execute debug log instruction
      await expect(
        new DebugLog(
          /*indirect=*/ 0,
          /*levelOffset=*/ levelOffset,
          /*messageOffset=*/ messageOffset,
          /*fieldsOffset=*/ fieldsOffset,
          /*fieldsSizeOffset=*/ fieldsSizeOffset,
          /*messageSize=*/ messageSize,
        ).execute(context),
      ).rejects.toThrow('Max debug log memory reads exceeded');
    });

    it('Should fail with invalid level', async () => {
      const env = initExecutionEnvironment({ clientInitiatedSimulation: true });
      const context = initContext({ env });

      const levelOffset = 5;
      const messageOffset = 10;
      const fieldsOffset = 100;
      const fieldsSizeOffset = 200;
      const fieldValue = new Field(0x42n);

      const message = 'Hello {0}!';
      const messageSize = message.length;
      for (let i = 0; i < messageSize; i++) {
        context.machineState.memory.set(messageOffset + i, new Uint8(BigInt(message.charCodeAt(i))));
      }

      // Invalid level
      context.machineState.memory.set(levelOffset, new Uint8(42));
      context.machineState.memory.set(fieldsOffset, fieldValue);
      context.machineState.memory.set(fieldsSizeOffset, new Uint32(1n)); // One field value

      // Execute debug log instruction
      await expect(
        new DebugLog(
          /*indirect=*/ 0,
          /*levelOffset=*/ levelOffset,
          /*messageOffset=*/ messageOffset,
          /*fieldsOffset=*/ fieldsOffset,
          /*fieldsSizeOffset=*/ fieldsSizeOffset,
          /*messageSize=*/ messageSize,
        ).execute(context),
      ).rejects.toThrow('Invalid debug log level: 42');
    });
  });
});
