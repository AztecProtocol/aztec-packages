import type { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';

import { mock } from 'jest-mock-extended';

import type { PublicPersistableStateManager } from '../../state_manager/state_manager.js';
import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag, Uint1 } from '../avm_memory_types.js';
import { initContext } from '../fixtures/index.js';
import { ContractInstanceMember, GetContractInstance } from './contract.js';

describe('Contract opcodes', () => {
  let address: AztecAddress;
  let contractInstance: SerializableContractInstance;
  let deployer: AztecAddress;
  let contractClassId: Fr;
  let initializationHash: Fr;

  let persistableState: jest.Mocked<PublicPersistableStateManager>;
  let context: AvmContext;

  beforeEach(async () => {
    address = await AztecAddress.random();
    contractInstance = await SerializableContractInstance.random();
    deployer = contractInstance.deployer;
    contractClassId = contractInstance.currentContractClassId;
    initializationHash = contractInstance.initializationHash;
    persistableState = mock<PublicPersistableStateManager>();
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

      expect(GetContractInstance.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    describe.each([
      [ContractInstanceMember.DEPLOYER, () => deployer.toField()],
      [ContractInstanceMember.CLASS_ID, () => contractClassId.toField()],
      [ContractInstanceMember.INIT_HASH, () => initializationHash.toField()],
    ])('GETCONTRACTINSTANCE member instruction ', (memberEnum: ContractInstanceMember, valueGetter: () => Fr) => {
      it(`Should read '${ContractInstanceMember[memberEnum]}' correctly`, async () => {
        const value = valueGetter();
        persistableState.getContractInstance.mockResolvedValue(contractInstance);

        context.machineState.memory.set(0, new Field(address.toField()));
        await new GetContractInstance(
          /*indirect=*/ 0,
          /*addressOffset=*/ 0,
          /*dstOffset=*/ 1,
          /*existsOffset=*/ 2,
          memberEnum,
        ).execute(context);

        expect(persistableState.getContractInstance).toHaveBeenCalledTimes(1);
        expect(persistableState.getContractInstance).toHaveBeenCalledWith(address);

        // value should be right
        expect(context.machineState.memory.getTag(1)).toBe(TypeTag.FIELD);
        const actual = context.machineState.memory.get(1);
        expect(actual).toEqual(new Field(value));

        // exists should be true
        expect(context.machineState.memory.getTag(2)).toBe(TypeTag.UINT1);
        const exists = context.machineState.memory.get(2);
        expect(exists).toEqual(new Uint1(1));
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
          persistableState.getContractInstance.mockResolvedValue(undefined);

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
    });
  });
});
