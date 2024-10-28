import {
  AvmCircuitInputs,
  Gas,
  GlobalVariables,
  type PublicFunction,
  PublicKeys,
  SerializableContractInstance,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr, Point } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { AvmSimulator, PublicSideEffectTrace, type WorldStateDB } from '@aztec/simulator';
import {
  getAvmTestContractBytecode,
  getAvmTestContractFunctionSelector,
  initContext,
  initExecutionEnvironment,
  initPersistableStateManager,
  resolveAvmTestContractAssertionMessage,
} from '@aztec/simulator/avm/fixtures';

import { mock } from 'jest-mock-extended';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from './bb/execute.js';
import { getPublicInputs } from './test/test_avm.js';
import { extractAvmVkData } from './verification_key/verification_key_data.js';

const TIMEOUT = 180_000;
const TIMESTAMP = new Fr(99833);

describe('AVM WitGen, proof generation and verification', () => {
  it(
    'Should prove and verify bulk_testing',
    async () => {
      await proveAndVerifyAvmTestContract(
        'bulk_testing',
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x)),
      );
    },
    TIMEOUT,
  );
});

/************************************************************************
 * Helpers
 ************************************************************************/

/**
 * If assertionErrString is set, we expect a (non exceptional halting) revert due to a failing assertion and
 * we check that the revert reason error contains this string. However, the circuit must correctly prove the
 * execution.
 */
const proveAndVerifyAvmTestContract = async (
  functionName: string,
  calldata: Fr[] = [],
  assertionErrString?: string,
) => {
  const startSideEffectCounter = 0;
  const functionSelector = getAvmTestContractFunctionSelector(functionName);
  calldata = [functionSelector.toField(), ...calldata];
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;

  const worldStateDB = mock<WorldStateDB>();
  //
  // Top level contract call
  const bytecode = getAvmTestContractBytecode('public_dispatch');
  const fnSelector = getAvmTestContractFunctionSelector('public_dispatch');
  const publicFn: PublicFunction = { bytecode, selector: fnSelector };
  const contractClass = makeContractClassPublic(0, publicFn);
  const contractInstance = makeContractInstanceFromClassId(contractClass.id);

  // The values here should match those in `avm_simulator.test.ts`
  const instanceGet = new SerializableContractInstance({
    version: 1,
    salt: new Fr(0x123),
    deployer: new Fr(0x456),
    contractClassId: new Fr(0x789),
    initializationHash: new Fr(0x101112),
    publicKeys: new PublicKeys(
      new Point(new Fr(0x131415), new Fr(0x161718), false),
      new Point(new Fr(0x192021), new Fr(0x222324), false),
      new Point(new Fr(0x252627), new Fr(0x282930), false),
      new Point(new Fr(0x313233), new Fr(0x343536), false),
    ),
  }).withAddress(contractInstance.address);

  worldStateDB.getContractInstance
    .mockResolvedValueOnce(contractInstance)
    .mockResolvedValueOnce(instanceGet) // test gets deployer
    .mockResolvedValueOnce(instanceGet) // test gets class id
    .mockResolvedValueOnce(instanceGet) // test gets init hash
    .mockResolvedValue(contractInstance);
  worldStateDB.getContractClass.mockResolvedValue(contractClass);

  const storageValue = new Fr(5);
  worldStateDB.storageRead.mockResolvedValue(Promise.resolve(storageValue));

  const trace = new PublicSideEffectTrace(startSideEffectCounter);
  const persistableState = initPersistableStateManager({ worldStateDB, trace });
  const environment = initExecutionEnvironment({
    functionSelector,
    calldata,
    globals,
    address: contractInstance.address,
  });
  const context = initContext({ env: environment, persistableState });

  worldStateDB.getBytecode.mockResolvedValue(bytecode);

  const startGas = new Gas(context.machineState.gasLeft.daGas, context.machineState.gasLeft.l2Gas);

  const internalLogger = createDebugLogger('aztec:avm-proving-test');
  const logger = (msg: string, _data?: any) => internalLogger.verbose(msg);

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // First we simulate (though it's not needed in this simple case).
  const simulator = new AvmSimulator(context);
  const avmResult = await simulator.execute();

  if (assertionErrString == undefined) {
    expect(avmResult.reverted).toBe(false);
  } else {
    // Explicit revert when an assertion failed.
    expect(avmResult.reverted).toBe(true);
    expect(avmResult.revertReason).toBeDefined();
    expect(resolveAvmTestContractAssertionMessage(functionName, avmResult.revertReason!)).toContain(assertionErrString);
  }

  const pxResult = trace.toPublicExecutionResult(
    environment,
    startGas,
    /*endGasLeft=*/ Gas.from(context.machineState.gasLeft),
    /*bytecode=*/ simulator.getBytecode()!,
    avmResult,
    functionName,
  );

  const avmCircuitInputs = new AvmCircuitInputs(
    functionName,
    /*calldata=*/ context.environment.calldata,
    /*publicInputs=*/ getPublicInputs(pxResult),
    /*avmHints=*/ pxResult.avmCircuitHints,
  );

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, logger);
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  // Then we test VK extraction and serialization.
  const succeededRes = proofRes as BBSuccess;
  const vkData = await extractAvmVkData(succeededRes.vkPath!);
  VerificationKeyData.fromBuffer(vkData.toBuffer());

  // Then we verify.
  const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
  const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
  expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
};
