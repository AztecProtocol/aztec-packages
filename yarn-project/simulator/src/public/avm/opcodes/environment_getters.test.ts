import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';

import { randomInt } from 'crypto';

import type { AvmContext } from '../avm_context.js';
import { TypeTag } from '../avm_memory_types.js';
import { initContext, initExecutionEnvironment, initGlobalVariables } from '../fixtures/initializers.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { EnvironmentVariable, GetEnvVar } from './environment_getters.js';

const address = await AztecAddress.random();
const sender = await AztecAddress.random();
describe('Environment getters', () => {
  const transactionFee = Fr.random();
  const chainId = Fr.random();
  const version = Fr.random();
  const blockNumber = randomInt(20000);
  const timestamp = BigInt(randomInt(100000)); // timestamp as UInt64
  const isStaticCall = true;
  const gasFees = GasFees.random();
  const globals = initGlobalVariables({
    chainId,
    version,
    blockNumber,
    timestamp,
    gasFees,
  });

  let context: AvmContext;
  beforeEach(async () => {
    const env = initExecutionEnvironment({
      address,
      sender,
      transactionFee,
      globals,
      isStaticCall,
    });
    context = initContext({ env });
  });

  it(`Should (de)serialize correctly`, () => {
    const buf = Buffer.from([
      Opcode.GETENVVAR_16, // opcode
      0x01, // indirect
      ...Buffer.from('1234', 'hex'), // dstOffset
      0x05, // var idx
    ]);
    const instr = new GetEnvVar(/*indirect=*/ 0x01, /*dstOffset=*/ 0x1234, 5).as(
      Opcode.GETENVVAR_16,
      GetEnvVar.wireFormat16,
    );

    expect(GetEnvVar.as(GetEnvVar.wireFormat16).fromBuffer(buf)).toEqual(instr);
    expect(instr.toBuffer()).toEqual(buf);
  });

  describe.each([
    [EnvironmentVariable.ADDRESS, address.toField()],
    [EnvironmentVariable.SENDER, sender.toField()],
    [EnvironmentVariable.TRANSACTIONFEE, transactionFee.toField()],
    [EnvironmentVariable.CHAINID, chainId.toField()],
    [EnvironmentVariable.VERSION, version.toField()],
    [EnvironmentVariable.BLOCKNUMBER, new Fr(blockNumber), TypeTag.UINT32],
    [EnvironmentVariable.TIMESTAMP, new Fr(timestamp), TypeTag.UINT64],
    [EnvironmentVariable.BASEFEEPERDAGAS, new Fr(gasFees.feePerDaGas), TypeTag.UINT128],
    [EnvironmentVariable.BASEFEEPERL2GAS, new Fr(gasFees.feePerL2Gas), TypeTag.UINT128],
    [EnvironmentVariable.ISSTATICCALL, new Fr(isStaticCall ? 1 : 0), TypeTag.UINT1],
  ])('Environment getter instructions', (envVar: EnvironmentVariable, value: Fr, tag: TypeTag = TypeTag.FIELD) => {
    it(`Should read '${EnvironmentVariable[envVar]}' correctly`, async () => {
      const instruction = new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 0, envVar);

      await instruction.execute(context);

      expect(context.machineState.memory.getTag(0)).toBe(tag);
      const actual = context.machineState.memory.get(0).toFr();
      expect(actual).toEqual(value);
    });
  });

  it(`GETENVVAR reverts for bad enum operand`, async () => {
    const invalidEnum = 255;
    const instruction = new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 0, invalidEnum);
    await expect(instruction.execute(context)).rejects.toThrow(`Invalid GETENVVAR var enum ${invalidEnum}`);
  });

  describe('Gas left environment variables', () => {
    it('Should read L2GASLEFT correctly', async () => {
      const instruction = new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 0, EnvironmentVariable.L2GASLEFT);

      await instruction.execute(context);

      expect(context.machineState.memory.getTag(0)).toBe(TypeTag.UINT32);
      const actual = context.machineState.memory.get(0).toFr();
      expect(actual).toEqual(new Fr(context.machineState.l2GasLeft));
    });

    it('Should read DAGASLEFT correctly', async () => {
      const instruction = new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 0, EnvironmentVariable.DAGASLEFT);

      await instruction.execute(context);

      expect(context.machineState.memory.getTag(0)).toBe(TypeTag.UINT32);
      const actual = context.machineState.memory.get(0).toFr();
      expect(actual).toEqual(new Fr(context.machineState.daGasLeft));
    });
  });
});
