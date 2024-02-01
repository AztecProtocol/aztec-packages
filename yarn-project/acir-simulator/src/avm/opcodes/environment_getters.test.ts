import { Fr } from '@aztec/foundation/fields';

import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { initExecutionEnvironment, initGlobalVariables } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import {
  Address,
  BlockNumber,
  ChainId,
  FeePerDAGas,
  FeePerL1Gas,
  FeePerL2Gas,
  Origin,
  Portal,
  Sender,
  StorageAddress,
  Timestamp,
  Version,
} from './environment_getters.js';

describe('Environment getters instructions', () => {
  let machineState: AvmMachineState;
  let journal: MockProxy<AvmJournal>;

  beforeEach(async () => {
    journal = mock<AvmJournal>();
  });

  type EnvInstruction = Portal | FeePerL1Gas | FeePerL2Gas | FeePerDAGas | Origin | Sender | StorageAddress | Address;
  const envGetterTest = async (key: string, value: Fr, instruction: EnvInstruction) => {
    machineState = new AvmMachineState(initExecutionEnvironment({ [key]: value }));

    await instruction.execute(machineState, journal);
    const actual = machineState.memory.get(0).toFr();
    expect(actual).toEqual(value);
  };

  describe('ADDRESS', () => {
    it('Should deserialize correctly', () => {
      const buf = Buffer.from([
        // opcode
        Address.opcode,
        // indirect
        0x01,
        // dstOffset
        0x12,
        0x34,
        0x56,
        0x78,
      ]);

      const inst = Address.deserialize(buf);
      expect(inst).toEqual(new Address(/*indirect=*/ 0x01, /*dstOffset=*/ 0x12345678));
    });

    it('Should serialize correctly', () => {
      const inst = new Address(/*indirect=*/ 0x01, /*dstOffset=*/ 0x12345678);

      const expected = Buffer.from([
        // opcode
        Address.opcode,
        // indirect
        0x01,
        // dstOffset
        0x12,
        0x34,
        0x56,
        0x78,
      ]);
      expect(inst.serialize()).toEqual(expected);
    });

    it('Should read address correctly', async () => {
      const address = new Fr(123456n);
      await envGetterTest('address', address, new Address(/*indirect=*/ 0, /*dstOffset=*/ 0));
    });
  });

  it('Should read storage address correctly', async () => {
    const address = new Fr(123456n);
    await envGetterTest('storageAddress', address, new StorageAddress(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read Portal correctly', async () => {
    const portal = new Fr(123456n);
    await envGetterTest('portal', portal, new Portal(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read FeePerL1Gas correctly', async () => {
    const feePerL1Gas = new Fr(123456n);
    await envGetterTest('feePerL1Gas', feePerL1Gas, new FeePerL1Gas(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read FeePerL2Gas correctly', async () => {
    const feePerL2Gas = new Fr(123456n);
    await envGetterTest('feePerL2Gas', feePerL2Gas, new FeePerL2Gas(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read FeePerDAGas correctly', async () => {
    const feePerDaGas = new Fr(123456n);
    await envGetterTest('feePerDaGas', feePerDaGas, new FeePerDAGas(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read Origin correctly', async () => {
    const origin = new Fr(123456n);
    await envGetterTest('origin', origin, new Origin(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  it('Should read Sender correctly', async () => {
    const sender = new Fr(123456n);
    await envGetterTest('sender', sender, new Sender(/*indirect=*/ 0, /*dstOffset=*/ 0));
  });

  describe('Global Variables', () => {
    type GlobalsInstruction = ChainId | Version | BlockNumber | Timestamp;
    const readGlobalVariableTest = async (key: string, value: Fr, instruction: GlobalsInstruction) => {
      const globals = initGlobalVariables({ [key]: value });
      machineState = new AvmMachineState(initExecutionEnvironment({ globals }));

      await instruction.execute(machineState, journal);
      const actual = machineState.memory.get(0).toFr();
      expect(actual).toEqual(value);
    };

    it('Should read chainId', async () => {
      const chainId = new Fr(123456n);
      await readGlobalVariableTest('chainId', chainId, new ChainId(/*indirect=*/ 0, /*dstOffset=*/ 0));
    });

    it('Should read version', async () => {
      const version = new Fr(123456n);
      await readGlobalVariableTest('version', version, new Version(/*indirect=*/ 0, /*dstOffset=*/ 0));
    });

    it('Should read block number', async () => {
      const blockNumber = new Fr(123456n);
      await readGlobalVariableTest('blockNumber', blockNumber, new BlockNumber(/*indirect=*/ 0, /*dstOffset=*/ 0));
    });

    it('Should read timestamp', async () => {
      const timestamp = new Fr(123456n);
      await readGlobalVariableTest('timestamp', timestamp, new Timestamp(/*indirect=*/ 0, /*dstOffset=*/ 0));
    });
  });
});
