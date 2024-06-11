import {
  AvmCircuitInputs,
  AztecAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  Gas,
  GlobalVariables,
  Header,
  L2ToL1Message,
  LogHash,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
  MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  MAX_NEW_NULLIFIERS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  NoteHash,
  Nullifier,
  PublicCircuitPublicInputs,
  ReadRequest,
  RevertCode,
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
} from '@aztec/simulator/avm/fixtures';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { AvmPersistableStateManager } from '../../simulator/src/avm/journal/journal.js';
import {
  convertAvmResultsToPxResult,
  createPublicExecution,
} from '../../simulator/src/public/transitional_adaptors.js';
import { SerializableContractInstance } from '../../types/src/contracts/contract_instance.js';
import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from './bb/execute.js';
import { extractVkData } from './verification_key/verification_key_data.js';

const TIMEOUT = 60_000;
const TIMESTAMP = new Fr(99833);

describe('AVM WitGen, proof generation and verification', () => {
  const avmFunctionsAndCalldata: [string, Fr[]][] = [
    ['add_args_return', [new Fr(1), new Fr(2)]],
    ['get_address', []],
    ['note_hash_exists', [new Fr(1), new Fr(2)]],
    ['test_get_contract_instance', []],
    ['set_storage_single', [new Fr(1)]],
    ['set_storage_list', [new Fr(1), new Fr(2)]],
    ['read_storage_single', [new Fr(1)]],
    ['read_storage_list', [new Fr(1)]],
    ['new_note_hash', [new Fr(1)]],
    ['new_nullifier', [new Fr(1)]],
    ['nullifier_exists', [new Fr(1)]],
    ['l1_to_l2_msg_exists', [new Fr(1), new Fr(2)]],
    ['send_l2_to_l1_msg', [new Fr(1), new Fr(2)]],
    ['to_radix_le', [new Fr(10)]],
    ['nested_call_to_add', [new Fr(1), new Fr(2)]],
  ];

  it.each(avmFunctionsAndCalldata)(
    'Should prove %s',
    async (name, calldata) => {
      await proveAndVerifyAvmTestContract(name, calldata);
    },
    TIMEOUT,
  );

  /************************************************************************
   * Hashing functions
   ************************************************************************/
  describe('AVM hash functions', () => {
    const avmHashFunctions: [string, Fr[]][] = [
      [
        'keccak_hash',
        [
          new Fr(189),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
        ],
      ],
      [
        'poseidon2_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'sha256_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'pedersen_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'pedersen_hash_with_index',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
    ];

    it.each(avmHashFunctions)(
      'Should prove %s',
      async (name, calldata) => {
        await proveAndVerifyAvmTestContract(name, calldata);
      },
      TIMEOUT,
    );
  });

  it(
    'Should prove that timestamp matches',
    async () => {
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP]);
    },
    TIMEOUT,
  );

  // TODO: Investigate why does the prover throws an out-of-range exception
  it.skip(
    'Should prove that mutated timestamp does not match',
    async () => {
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP], [new Fr(231)]);
    },
    TIMEOUT,
  );

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

const proveAndVerifyAvmTestContract = async (functionName: string, calldata: Fr[] = [], mutatedCalldata: Fr[] = []) => {
  const startSideEffectCounter = 0;
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;
  const environment = initExecutionEnvironment({ calldata, globals });

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
  const persistableState = new AvmPersistableStateManager(hostStorage);
  const context = initContext({ env: environment, persistableState });
  const nestedCallBytecode = getAvmTestContractBytecode('add_args_return');
  jest
    .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
    .mockReturnValue(Promise.resolve(nestedCallBytecode));

  const startGas = new Gas(context.machineState.gasLeft.daGas, context.machineState.gasLeft.l2Gas);
  const oldPublicExecution = createPublicExecution(startSideEffectCounter, environment, calldata);

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
  expect(avmResult.reverted).toBe(false);

  const pxResult = convertAvmResultsToPxResult(
    avmResult,
    startSideEffectCounter,
    oldPublicExecution,
    startGas,
    context,
    simulator.getBytecode(),
  );
  // TODO(dbanks12): public inputs should not be empty.... Need to construct them from AvmContext?
  const uncompressedBytecode = simulator.getBytecode()!;

  const publicInputs = getPublicInputs(pxResult);
  const avmCircuitInputs = new AvmCircuitInputs(
    uncompressedBytecode,
    mutatedCalldata.length === 0 ? context.environment.calldata : mutatedCalldata,
    publicInputs,
    pxResult.avmHints,
  );

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, logger);

  if (mutatedCalldata.length !== 0) {
    expect(proofRes.status).toEqual(BB_RESULT.FAILURE);
  } else {
    expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

    // Then we test VK extraction.
    const succeededRes = proofRes as BBSuccess;
    const verificationKey = await extractVkData(succeededRes.vkPath!);
    expect(verificationKey.keyAsBytes).toHaveLength(16);

    // Then we verify.
    const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
    const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
  }
};

// TODO: pub somewhere more usable - copied from abstract phase manager
const getPublicInputs = (result: PublicExecutionResult): PublicCircuitPublicInputs => {
  return PublicCircuitPublicInputs.from({
    callContext: result.execution.callContext,
    proverAddress: AztecAddress.ZERO,
    argsHash: computeVarArgsHash(result.execution.args),
    newNoteHashes: padArrayEnd(result.newNoteHashes, NoteHash.empty(), MAX_NEW_NOTE_HASHES_PER_CALL),
    newNullifiers: padArrayEnd(result.newNullifiers, Nullifier.empty(), MAX_NEW_NULLIFIERS_PER_CALL),
    newL2ToL1Msgs: padArrayEnd(result.newL2ToL1Messages, L2ToL1Message.empty(), MAX_NEW_L2_TO_L1_MSGS_PER_CALL),
    startSideEffectCounter: result.startSideEffectCounter,
    endSideEffectCounter: result.endSideEffectCounter,
    returnsHash: computeVarArgsHash(result.returnValues),
    noteHashReadRequests: padArrayEnd(
      result.noteHashReadRequests,
      ReadRequest.empty(),
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
      ReadRequest.empty(),
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
    publicCallStackHashes: padArrayEnd([], Fr.zero(), MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL),
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
