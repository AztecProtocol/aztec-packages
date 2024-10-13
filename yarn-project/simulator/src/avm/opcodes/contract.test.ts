import { randomContractInstanceWithAddress } from '@aztec/circuit-types';
import { AztecAddress, SerializableContractInstance } from '@aztec/circuits.js';

import { mock } from 'jest-mock-extended';

import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { initContext, initPersistableStateManager } from '../fixtures/index.js';
import { type AvmPersistableStateManager } from '../journal/journal.js';
import { mockGetContractInstance } from '../test_utils.js';
import { GetContractInstance } from './contract.js';

describe('Contract opcodes', () => {
  const address = AztecAddress.random();

  let worldStateDB: WorldStateDB;
  let trace: PublicSideEffectTraceInterface;
  let persistableState: AvmPersistableStateManager;
  let context: AvmContext;

  beforeEach(() => {
    worldStateDB = mock<WorldStateDB>();
    trace = mock<PublicSideEffectTraceInterface>();
    persistableState = initPersistableStateManager({ worldStateDB, trace });
    context = initContext({ persistableState });
  });

  describe('GETCONTRACTINSTANCE', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        GetContractInstance.opcode, // opcode
        0x01, // indirect
        ...Buffer.from('12345678', 'hex'), // addressOffset
        ...Buffer.from('a2345678', 'hex'), // dstOffset
      ]);
      const inst = new GetContractInstance(
        /*indirect=*/ 0x01,
        /*addressOffset=*/ 0x12345678,
        /*dstOffset=*/ 0xa2345678,
      );

      expect(GetContractInstance.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    it('should copy contract instance to memory if found', async () => {
      const contractInstance = randomContractInstanceWithAddress(/*(base instance) opts=*/ {}, /*address=*/ address);
      mockGetContractInstance(worldStateDB, contractInstance);

      context.machineState.memory.set(0, new Field(address.toField()));
      await new GetContractInstance(/*indirect=*/ 0, /*addressOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      const actual = context.machineState.memory.getSlice(1, 6);
      expect(actual).toEqual([
        new Field(1), // found
        new Field(contractInstance.salt),
        new Field(contractInstance.deployer),
        new Field(contractInstance.contractClassId),
        new Field(contractInstance.initializationHash),
        new Field(contractInstance.publicKeysHash),
      ]);

      expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(1);
      expect(trace.traceGetContractInstance).toHaveBeenCalledWith({ exists: true, ...contractInstance });
    });

    it('should return zeroes if not found', async () => {
      const emptyContractInstance = SerializableContractInstance.empty().withAddress(address);
      context.machineState.memory.set(0, new Field(address.toField()));

      await new GetContractInstance(/*indirect=*/ 0, /*addressOffset=*/ 0, /*dstOffset=*/ 1).execute(context);

      const actual = context.machineState.memory.getSlice(1, 6);
      expect(actual).toEqual([
        new Field(0), // found
        new Field(0),
        new Field(0),
        new Field(0),
        new Field(0),
        new Field(0),
      ]);

      expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(1);
      expect(trace.traceGetContractInstance).toHaveBeenCalledWith({ exists: false, ...emptyContractInstance });
    });
  });
});
