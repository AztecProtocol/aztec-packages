import {
  AvmCircuitInputs,
  AvmVerificationKeyData,
  AztecAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  FunctionSelector,
  Gas,
  GlobalVariables,
  Header,
  L2ToL1Message,
  LogHash,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  NoteHash,
  Nullifier,
  PublicCircuitPublicInputs,
  PublicInnerCallRequest,
  ReadRequest,
  RevertCode,
  TreeLeafReadRequest,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { AvmSimulator, type PublicContractsDB, type PublicExecutionResult, type PublicStateDB } from '@aztec/simulator';
import {
  getAvmTestContractBytecode,
  initContext,
  initExecutionEnvironment,
  initHostStorage,
  initPersistableStateManager,
  resolveAvmTestContractAssertionMessage,
} from '@aztec/simulator/avm/fixtures';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { PublicSideEffectTrace } from '../../simulator/src/public/side_effect_trace.js';
import { SerializableContractInstance } from '../../types/src/contracts/contract_instance.js';
import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from './bb/execute.js';
import { extractAvmVkData } from './verification_key/verification_key_data.js';

const TIMEOUT = 60_000;
const TIMESTAMP = new Fr(99833);

// FIXME: This fails with "main_kernel_value_out_evaluation failed".
describe.skip('AVM WitGen, proof generation and verification', () => {
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

// TODO: pub somewhere more usable - copied from abstract phase manager
const getPublicInputs = (result: PublicExecutionResult): PublicCircuitPublicInputs => {
  return PublicCircuitPublicInputs.from({
    callContext: result.executionRequest.callContext,
    proverAddress: AztecAddress.ZERO,
    argsHash: computeVarArgsHash(result.executionRequest.args),
    noteHashes: padArrayEnd(result.noteHashes, NoteHash.empty(), MAX_NOTE_HASHES_PER_CALL),
    nullifiers: padArrayEnd(result.nullifiers, Nullifier.empty(), MAX_NULLIFIERS_PER_CALL),
    l2ToL1Msgs: padArrayEnd(result.l2ToL1Messages, L2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_CALL),
    startSideEffectCounter: result.startSideEffectCounter,
    endSideEffectCounter: result.endSideEffectCounter,
    returnsHash: computeVarArgsHash(result.returnValues),
    noteHashReadRequests: padArrayEnd(
      result.noteHashReadRequests,
      TreeLeafReadRequest.empty(),
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    ),
    nullifierReadRequests: padArrayEnd(
      result.nullifierReadRequests,
      ReadRequest.empty(),
      MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
    ),
    nullifierNonExistentReadRequests: padArrayEnd(
      result.nullifierNonExistentReadRequests,
      ReadRequest.empty(),
      MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
    ),
    l1ToL2MsgReadRequests: padArrayEnd(
      result.l1ToL2MsgReadRequests,
      TreeLeafReadRequest.empty(),
      MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
    ),
    contractStorageReads: padArrayEnd(
      result.contractStorageReads,
      ContractStorageRead.empty(),
      MAX_PUBLIC_DATA_READS_PER_CALL,
    ),
    contractStorageUpdateRequests: padArrayEnd(
      result.contractStorageUpdateRequests,
      ContractStorageUpdateRequest.empty(),
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
    ),
    publicCallRequests: padArrayEnd([], PublicInnerCallRequest.empty(), MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL),
    unencryptedLogsHashes: padArrayEnd(result.unencryptedLogsHashes, LogHash.empty(), MAX_UNENCRYPTED_LOGS_PER_CALL),
    historicalHeader: Header.empty(),
    globalVariables: GlobalVariables.empty(),
    startGasLeft: Gas.from(result.startGasLeft),
    endGasLeft: Gas.from(result.endGasLeft),
    transactionFee: result.transactionFee,
    // TODO(@just-mitch): need better mapping from simulator to revert code.
    revertCode: result.reverted ? RevertCode.APP_LOGIC_REVERTED : RevertCode.OK,
  });
};
