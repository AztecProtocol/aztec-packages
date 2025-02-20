import { GasFees } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { randomInt } from 'crypto';

import { type AvmContext } from '../avm_context.js';
import { TypeTag } from '../avm_memory_types.js';
import { initContext, initExecutionEnvironment, initGlobalVariables } from '../fixtures/index.js';
import { Opcode } from '../serialization/instruction_serialization.js';
import { EnvironmentVariable, GetEnvVar } from './environment_getters.js';

const address = await AztecAddress.random();
const sender = await AztecAddress.random();
describe('Environment getters', () => {
  const transactionFee = Fr.random();
  const chainId = Fr.random();
  const version = Fr.random();
  const blockNumber = Fr.random();
  const timestamp = new Fr(randomInt(100000)); // cap timestamp since must fit in u64
  const feePerDaGas = Fr.random();
  const feePerL2Gas = Fr.random();
  const isStaticCall = true;
  const gasFees = new GasFees(feePerDaGas, feePerL2Gas);
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

    expect(GetEnvVar.as(GetEnvVar.wireFormat16).deserialize(buf)).toEqual(instr);
    expect(instr.serialize()).toEqual(buf);
  });

  describe.each([
    [EnvironmentVariable.ADDRESS, address.toField()],
    [EnvironmentVariable.SENDER, sender.toField()],
    [EnvironmentVariable.TRANSACTIONFEE, transactionFee.toField()],
    [EnvironmentVariable.CHAINID, chainId.toField()],
    [EnvironmentVariable.VERSION, version.toField()],
    [EnvironmentVariable.BLOCKNUMBER, blockNumber.toField()],
    [EnvironmentVariable.TIMESTAMP, timestamp.toField(), TypeTag.UINT64],
    [EnvironmentVariable.FEEPERDAGAS, feePerDaGas.toField()],
    [EnvironmentVariable.FEEPERL2GAS, feePerL2Gas.toField()],
    [EnvironmentVariable.ISSTATICCALL, new Fr(isStaticCall ? 1 : 0)],
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
    await expect(instruction.execute(context)).rejects.toThrowError(`Invalid GETENVVAR var enum ${invalidEnum}`);
  });
});
