import { AztecAddress, type Fr, SerializableContractInstance } from '@aztec/circuits.js';

import { mock } from 'jest-mock-extended';

import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint1 } from '../avm_memory_types.js';
import { initContext, initPersistableStateManager } from '../fixtures/index.js';
import { type AvmPersistableStateManager } from '../journal/journal.js';
import { mockGetContractInstance, mockNullifierExists } from '../test_utils.js';
import { ContractInstanceMember, GetContractInstance } from './contract.js';

describe('Contract opcodes', () => {
  const address = AztecAddress.random();
  const contractInstance = SerializableContractInstance.random();
  const deployer = contractInstance.deployer;
  const contractClassId = contractInstance.contractClassId;
  const initializationHash = contractInstance.initializationHash;

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
        ...Buffer.from('1234', 'hex'), // addressOffset
        ...Buffer.from('a234', 'hex'), // dstOffset
        ...Buffer.from('b234', 'hex'), // existsOffset
        0x02, // memberEnum (immediate)
      ]);
      const inst = new GetContractInstance(
        /*indirect=*/ 0x01,
        /*addressOffset=*/ 0x1234,
        /*dstOffset=*/ 0xa234,
        /*existsOffset=*/ 0xb234,
        /*memberEnum=*/ 0x02,
      );

      expect(GetContractInstance.deserialize(buf)).toEqual(inst);
      expect(inst.serialize()).toEqual(buf);
    });

    describe.each([
      [ContractInstanceMember.DEPLOYER, deployer.toField()],
      [ContractInstanceMember.CLASS_ID, contractClassId.toField()],
      [ContractInstanceMember.INIT_HASH, initializationHash.toField()],
    ])('GETCONTRACTINSTANCE member instruction ', (memberEnum: ContractInstanceMember, value: Fr) => {
      it(`Should read '${ContractInstanceMember[memberEnum]}' correctly`, async () => {
        mockGetContractInstance(worldStateDB, contractInstance.withAddress(address));
        mockNullifierExists(worldStateDB, address.toField());

        context.machineState.memory.set(0, new Field(address.toField()));
        await new GetContractInstance(
          /*indirect=*/ 0,
          /*addressOffset=*/ 0,
          /*dstOffset=*/ 1,
          /*existsOffset=*/ 2,
          memberEnum,
        ).execute(context);

        // value should be right
        expect(context.machineState.memory.getTag(1)).toBe(TypeTag.FIELD);
        const actual = context.machineState.memory.get(1);
        expect(actual).toEqual(new Field(value));

        // exists should be true
        expect(context.machineState.memory.getTag(2)).toBe(TypeTag.UINT1);
        const exists = context.machineState.memory.get(2);
        expect(exists).toEqual(new Uint1(1));

        expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(1);
        expect(trace.traceGetContractInstance).toHaveBeenCalledWith(address, /*exists=*/ true, contractInstance);
      });
    });

    describe.each([
      [ContractInstanceMember.DEPLOYER],
      [ContractInstanceMember.CLASS_ID],
      [ContractInstanceMember.INIT_HASH],
    ])(
      'GETCONTRACTINSTANCE member instruction works when contract does not exist',
      (memberEnum: ContractInstanceMember) => {
        it(`'${ContractInstanceMember[memberEnum]}' should be 0 when contract does not exist `, async () => {
          context.machineState.memory.set(0, new Field(address.toField()));
          await new GetContractInstance(
            /*indirect=*/ 0,
            /*addressOffset=*/ 0,
            /*dstOffset=*/ 1,
            /*existsOffset=*/ 2,
            memberEnum,
          ).execute(context);

          // value should be 0
          expect(context.machineState.memory.getTag(1)).toBe(TypeTag.FIELD);
          const actual = context.machineState.memory.get(1);
          expect(actual).toEqual(new Field(0));

          // exists should be false
          expect(context.machineState.memory.getTag(2)).toBe(TypeTag.UINT1);
          const exists = context.machineState.memory.get(2);
          expect(exists).toEqual(new Uint1(0));

          expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(1);
          expect(trace.traceGetContractInstance).toHaveBeenCalledWith(address, /*exists=*/ false);
        });
      },
    );

    it(`GETCONTRACTINSTANCE reverts for bad enum operand`, async () => {
      const invalidEnum = 255;
      const instruction = new GetContractInstance(
        /*indirect=*/ 0,
        /*addressOffset=*/ 0,
        /*dstOffset=*/ 1,
        /*existsOffset=*/ 2,
        /*memberEnum=*/ invalidEnum,
      );
      await expect(instruction.execute(context)).rejects.toThrow(
        `Invalid GETCONSTRACTINSTANCE member enum ${invalidEnum}`,
      );

      expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(0);
    });
  });
});
