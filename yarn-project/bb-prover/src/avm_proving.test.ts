import { AvmCircuitInputs, AvmVerificationKeyData, FunctionSelector, Gas, GlobalVariables } from '@aztec/circuits.js';
import { GlobalVariables } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { AvmSimulator, type PublicContractsDB, PublicSideEffectTrace, type PublicStateDB } from '@aztec/simulator';
import {
  getAvmTestContractBytecode,
  initContext,
  initExecutionEnvironment,
  initHostStorage,
  initPersistableStateManager,
  resolveAvmTestContractAssertionMessage,
} from '@aztec/simulator/avm/fixtures';
import { SerializableContractInstance } from '@aztec/types/contracts';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from './bb/execute.js';
import { extractAvmVkData } from './verification_key/verification_key_data.js';

const TIMEOUT = 60_000;
const TIMESTAMP = new Fr(99833);
const GLOBAL_VARIABLES = GlobalVariables.empty();
GLOBAL_VARIABLES.timestamp = TIMESTAMP;

// FIXME: This fails with "main_kernel_value_out_evaluation failed".
describe.skip('AVM WitGen, proof generation and verification', () => {
  it(
    'Should prove and verify bulk_testing',
    async () => {
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP], undefined);
    },
    TIMEOUT,
  );

  it(
    'Should prove that mutated timestamp does not match and a revert is performed',
    async () => {
      // The error assertion string must match with that of assert_timestamp noir function.
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP.add(new Fr(1))], 'timestamp does not match');
    },
    TIMEOUT,
  );

  /************************************************************************
   * Avm Embedded Curve functions
   ************************************************************************/
  describe('AVM Embedded Curve functions', () => {
    const avmEmbeddedCurveFunctions: [string, Fr[]][] = [
      ['elliptic_curve_add_and_double', []],
      ['variable_base_msm', []],
      ['pedersen_commit', [new Fr(1), new Fr(100)]],
    ];
    it.each(avmEmbeddedCurveFunctions)(
      'Should prove %s',
      async (name, calldata) => {
        await proveAndVerifyAvmTestContract(name, calldata);
      },
      TIMEOUT,
    );
  });

  /************************************************************************
   * AvmContext functions
   ************************************************************************/
  describe('AVM Context functions', () => {
    const avmContextFunctions = [
      'get_address',
      'get_storage_address',
      'get_sender',
      'get_fee_per_l2_gas',
      'get_fee_per_da_gas',
      'get_transaction_fee',
      'get_function_selector',
      'get_chain_id',
      'get_version',
      'get_block_number',
      'get_timestamp',
      'get_l2_gas_left',
      'get_da_gas_left',
    ];

    it.each(avmContextFunctions)(
      'Should prove %s',
      async contextFunction => {
        await proveAndVerifyAvmTestContract(contextFunction);
      },
      TIMEOUT,
    );
  });
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
  const functionSelector = FunctionSelector.random();
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;
  const environment = initExecutionEnvironment({ functionSelector, calldata, globals });

  const contractsDb = mock<PublicContractsDB>();
  const contractInstance = new SerializableContractInstance({
    version: 1,
    salt: new Fr(0x123),
    deployer: new Fr(0x456),
    contractClassId: new Fr(0x789),
    initializationHash: new Fr(0x101112),
    publicKeysHash: new Fr(0x161718),
  }).withAddress(environment.address);
  contractsDb.getContractInstance.mockResolvedValue(Promise.resolve(contractInstance));

  const storageDb = mock<PublicStateDB>();
  const storageValue = new Fr(5);
  storageDb.storageRead.mockResolvedValue(Promise.resolve(storageValue));

  const hostStorage = initHostStorage({ contractsDb });
  const trace = new PublicSideEffectTrace(startSideEffectCounter);
  const persistableState = initPersistableStateManager({ hostStorage, trace });
  const context = initContext({ env: environment, persistableState });
  const nestedCallBytecode = getAvmTestContractBytecode('add_args_return');
  jest.spyOn(hostStorage.contractsDb, 'getBytecode').mockResolvedValue(nestedCallBytecode);

  const startGas = new Gas(context.machineState.gasLeft.daGas, context.machineState.gasLeft.l2Gas);

  const internalLogger = createDebugLogger('aztec:avm-proving-test');
  const logger = (msg: string, _data?: any) => internalLogger.verbose(msg);

  // Use a simple contract that emits a side effect
  const bytecode = getAvmTestContractBytecode(functionName);
  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // First we simulate (though it's not needed in this simple case).
  const simulator = new AvmSimulator(context);
  const avmResult = await simulator.executeBytecode(bytecode);

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
    /*bytecode=*/ simulator.getBytecode()!, // uncompressed bytecode
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
  AvmVerificationKeyData.fromBuffer(vkData.toBuffer());

  // Then we verify.
  const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
  const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
  expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
};
