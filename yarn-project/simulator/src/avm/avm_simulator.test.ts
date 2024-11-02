import {
  GasFees,
  GlobalVariables,
  type PublicFunction,
  PublicKeys,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { keccak256, keccakf1600, pedersenCommit, pedersenHash, poseidon2Hash, sha256 } from '@aztec/foundation/crypto';
import { Fq, Fr, Point } from '@aztec/foundation/fields';
import { type Fieldable } from '@aztec/foundation/serialize';

import { randomInt } from 'crypto';
import { mock } from 'jest-mock-extended';

import { PublicEnqueuedCallSideEffectTrace } from '../public/enqueued_call_side_effect_trace.js';
import { type WorldStateDB } from '../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../public/side_effect_trace_interface.js';
import { type AvmContext } from './avm_context.js';
import { type AvmExecutionEnvironment } from './avm_execution_environment.js';
import { type MemoryValue, TypeTag, type Uint8, type Uint64 } from './avm_memory_types.js';
import { AvmSimulator } from './avm_simulator.js';
import { isAvmBytecode, markBytecodeAsAvm } from './bytecode_utils.js';
import {
  getAvmTestContractBytecode,
  getAvmTestContractFunctionSelector,
  initContext,
  initExecutionEnvironment,
  initGlobalVariables,
  initMachineState,
  initPersistableStateManager,
  randomMemoryBytes,
  randomMemoryFields,
  randomMemoryUint64s,
  resolveAvmTestContractAssertionMessage,
} from './fixtures/index.js';
import { type AvmPersistableStateManager } from './journal/journal.js';
import {
  Add,
  CalldataCopy,
  EmitNoteHash,
  EmitNullifier,
  EmitUnencryptedLog,
  type Instruction,
  Jump,
  L1ToL2MessageExists,
  NoteHashExists,
  NullifierExists,
  Return,
  SLoad,
  SStore,
  SendL2ToL1Message,
  Set,
} from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';
import { Opcode } from './serialization/instruction_serialization.js';
import {
  mockGetBytecode,
  mockGetContractClass,
  mockGetContractInstance,
  mockL1ToL2MessageExists,
  mockNoteHashExists,
  mockNullifierExists,
  mockStorageRead,
  mockStorageReadWithMap,
  mockTraceFork,
} from './test_utils.js';

describe('AVM simulator: injected bytecode', () => {
  let calldata: Fr[];
  let bytecode: Buffer;

  beforeAll(() => {
    calldata = [new Fr(1), new Fr(2)];
    bytecode = encodeToBytecode([
      new Set(/*indirect*/ 0, TypeTag.UINT32, /*value*/ 0, /*dstOffset*/ 0).as(Opcode.SET_8, Set.wireFormat8),
      new Set(/*indirect*/ 0, TypeTag.UINT32, /*value*/ 2, /*dstOffset*/ 1).as(Opcode.SET_8, Set.wireFormat8),
      new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ 0, /*copySize=*/ 1, /*dstOffset=*/ 0),
      new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
      new Return(/*indirect=*/ 0, /*returnOffset=*/ 2, /*copySize=*/ 1),
    ]);
  });

  it('Should not be recognized as AVM bytecode (magic missing)', () => {
    expect(!isAvmBytecode(bytecode));
  });

  it('Should execute bytecode that performs basic addition', async () => {
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });
    const results = await new AvmSimulator(context).executeBytecode(markBytecodeAsAvm(bytecode));

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(3)]);
  });

  it('Should halt if runs out of gas', async () => {
    const context = initContext({
      env: initExecutionEnvironment({ calldata }),
      machineState: initMachineState({ l2GasLeft: 5 }),
    });

    const results = await new AvmSimulator(context).executeBytecode(markBytecodeAsAvm(bytecode));
    expect(results.reverted).toBe(true);
    expect(results.output).toEqual([]);
    expect(results.revertReason?.message).toEqual('Not enough L2GAS gas left');
    expect(context.machineState.l2GasLeft).toEqual(0);
    expect(context.machineState.daGasLeft).toEqual(0);
  });
});

const TIMESTAMP = new Fr(99833);

describe('AVM simulator: transpiled Noir contracts', () => {
  it('bulk testing', async () => {
    const functionName = 'bulk_testing';
    const functionSelector = getAvmTestContractFunctionSelector(functionName);
    const args = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const calldata = [functionSelector.toField(), ...args];
    const globals = GlobalVariables.empty();
    globals.timestamp = TIMESTAMP;

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
    const worldStateDB = mock<WorldStateDB>();
    worldStateDB.getContractInstance
      .mockResolvedValueOnce(contractInstance)
      .mockResolvedValueOnce(instanceGet) // test gets deployer
      .mockResolvedValueOnce(instanceGet) // test gets class id
      .mockResolvedValueOnce(instanceGet) // test gets init hash
      .mockResolvedValue(contractInstance);
    worldStateDB.getContractClass.mockResolvedValue(contractClass);

    const storageValue = new Fr(5);
    mockStorageRead(worldStateDB, storageValue);

    const trace = mock<PublicSideEffectTraceInterface>();
    const persistableState = initPersistableStateManager({ worldStateDB, trace });
    const environment = initExecutionEnvironment({
      functionSelector,
      calldata,
      globals,
      address: contractInstance.address,
      sender: new Fr(42),
    });
    const context = initContext({ env: environment, persistableState });

    const nestedTrace = mock<PublicSideEffectTraceInterface>();
    mockTraceFork(trace, nestedTrace);
    mockGetBytecode(worldStateDB, bytecode);

    // First we simulate (though it's not needed in this simple case).
    const simulator = new AvmSimulator(context);
    const results = await simulator.execute();

    expect(results.reverted).toBe(false);
  });
  it('addition', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('add_args_return');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(3)]);
  });

  it('addition via dispatch', async () => {
    const calldata: Fr[] = [
      FunctionSelector.fromSignature('add_args_return(Field,Field)').toField(),
      new Fr(1),
      new Fr(2),
    ];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('public_dispatch');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(3)]);
  });

  it('get_args_hash via dispatch', async () => {
    const calldata = [new Fr(8), new Fr(1), new Fr(2), new Fr(3)];
    const dispatchCalldata = [FunctionSelector.fromSignature('get_args_hash(u8,[Field;3])').toField(), ...calldata];

    const context = initContext({ env: initExecutionEnvironment({ calldata: dispatchCalldata }) });
    const bytecode = getAvmTestContractBytecode('public_dispatch');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([computeVarArgsHash(calldata)]);
  });

  it('functionSelector getter via dispatch', async () => {
    const selector = FunctionSelector.fromSignature('get_function_selector()').toField();
    const dispatchCalldata = [selector];

    const context = initContext({ env: initExecutionEnvironment({ calldata: dispatchCalldata }) });
    const bytecode = getAvmTestContractBytecode('public_dispatch');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([selector]);
  });

  it('modulo and u1', async () => {
    const calldata: Fr[] = [new Fr(2)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('modulo2');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(0)]);
  });

  it('Should be recognized as AVM bytecode (magic present)', () => {
    const bytecode = getAvmTestContractBytecode('add_args_return');
    expect(isAvmBytecode(bytecode));
  });

  it('Should handle calldata oracle', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2), new Fr(3)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('assert_calldata_copy');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
  });

  it('Should handle return oracle', async () => {
    const context = initContext();

    const bytecode = getAvmTestContractBytecode('return_oracle');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(1), new Fr(2), new Fr(3)]);
  });

  it('Should handle revert oracle', async () => {
    const context = initContext();

    const bytecode = getAvmTestContractBytecode('revert_oracle');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(true);
    expect(results.output).toEqual([new Fr(1), new Fr(2), new Fr(3)]);
  });

  it('ec_add should not revert', async () => {
    // This test performs the same doubling as in elliptic_curve_add_and_double
    // But the optimizer is not able to optimize out the addition
    const calldata: Fr[] = [
      new Fr(1), // P1x
      new Fr(17631683881184975370165255887551781615748388533673675138860n), // P1y
      new Fr(0), // P1inf
      new Fr(1), // P2x
      new Fr(17631683881184975370165255887551781615748388533673675138860n), // P2y
      new Fr(0), // P2inf
    ];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('elliptic_curve_add');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
  });

  it('elliptic curve operations', async () => {
    const context = initContext();

    const bytecode = getAvmTestContractBytecode('elliptic_curve_add_and_double');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    const grumpkin = new Grumpkin();
    const g3 = grumpkin.mul(grumpkin.generator(), new Fq(3));
    expect(results.output).toEqual([g3.x, g3.y, Fr.ZERO]);
  });

  it('variable msm operations', async () => {
    const context = initContext();

    const bytecode = getAvmTestContractBytecode('variable_base_msm');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    const grumpkin = new Grumpkin();
    const g3 = grumpkin.mul(grumpkin.generator(), new Fq(3));
    const g20 = grumpkin.mul(grumpkin.generator(), new Fq(20));
    const expectedResult = grumpkin.add(g3, g20);
    expect(results.output).toEqual([expectedResult.x, expectedResult.y, Fr.ZERO]);
  });

  it('pedersen commitment operations', async () => {
    const calldata: Fr[] = [new Fr(100), new Fr(1)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('pedersen_commit');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    // This doesnt include infinites
    const expectedResult = pedersenCommit([Buffer.from([100]), Buffer.from([1])], 20).map(f => new Fr(f));
    // TODO: Come back to the handling of infinities when we confirm how they're handled in bb
    const isInf = expectedResult[0] === new Fr(0) && expectedResult[1] === new Fr(0);
    expectedResult.push(new Fr(isInf));
    expect(results.output).toEqual(expectedResult);
  });

  describe('U128 addition and overflows', () => {
    it('U128 addition', async () => {
      const calldata: Fr[] = [
        // First U128
        new Fr(1),
        new Fr(2),
        // Second U128
        new Fr(3),
        new Fr(4),
      ];
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('add_u128');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([new Fr(4), new Fr(6)]);
    });

    it('Expect failure on U128::add() overflow', async () => {
      const bytecode = getAvmTestContractBytecode('u128_addition_overflow');
      const results = await new AvmSimulator(initContext()).executeBytecode(bytecode);
      expect(results.reverted).toBe(true);
      expect(results.revertReason).toBeDefined();
      expect(resolveAvmTestContractAssertionMessage('u128_addition_overflow', results.revertReason!)).toMatch(
        'attempt to add with overflow',
      );
    });

    it('Expect failure on U128::from_integer() overflow', async () => {
      const bytecode = getAvmTestContractBytecode('u128_from_integer_overflow');
      const results = await new AvmSimulator(initContext()).executeBytecode(bytecode);
      expect(results.reverted).toBe(true);
      expect(results.revertReason).toBeDefined();
      expect(resolveAvmTestContractAssertionMessage('u128_from_integer_overflow', results.revertReason!)).toMatch(
        'call to assert_max_bit_size',
      );
    });
  });

  it('Logging', async () => {
    const context = initContext();
    const bytecode = getAvmTestContractBytecode('debug_logging');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([]);
  });

  it('Assertion message', async () => {
    const calldata: Fr[] = [new Fr(20)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('assert_nullifier_exists');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(true);
    expect(results.revertReason).toBeDefined();
    expect(resolveAvmTestContractAssertionMessage('assert_nullifier_exists', results.revertReason!)).toMatch(
      "Nullifier doesn't exist!",
    );
    expect(results.output).toEqual([]);
  });

  describe.each([
    ['set_opcode_u8', 8n],
    ['set_opcode_u32', 1n << 30n],
    ['set_opcode_u64', 1n << 60n],
    ['set_opcode_small_field', 0x001234567890abcdef1234567890abcdefn],
    ['set_opcode_big_field', 0x991234567890abcdef1234567890abcdefn],
    ['set_opcode_really_big_field', 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn],
  ])('SET functions', (name: string, res: bigint) => {
    it(`function '${name}'`, async () => {
      const context = initContext();
      const bytecode = getAvmTestContractBytecode(name);
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([new Fr(res)]);
    });
  });

  describe.each([
    ['sha256_hash', /*input=*/ randomMemoryBytes(10), /*output=*/ sha256FromMemoryBytes],
    ['keccak_hash', /*input=*/ randomMemoryBytes(10), /*output=*/ keccak256FromMemoryBytes],
    ['keccak_f1600', /*input=*/ randomMemoryUint64s(25), /*output=*/ keccakF1600FromMemoryUint64s],
    ['poseidon2_hash', /*input=*/ randomMemoryFields(10), /*output=*/ poseidon2FromMemoryFields],
    ['pedersen_hash', /*input=*/ randomMemoryFields(10), /*output=*/ pedersenFromMemoryFields],
    ['pedersen_hash_with_index', /*input=*/ randomMemoryFields(10), /*output=*/ indexedPedersenFromMemoryFields],
  ])('Hashes in noir contracts', (name: string, input: MemoryValue[], output: (msg: any[]) => Fr[]) => {
    it(`Should execute contract function that performs ${name}`, async () => {
      const calldata = input.map(e => e.toFr());

      const context = initContext({ env: initExecutionEnvironment({ calldata }) });
      const bytecode = getAvmTestContractBytecode(name);
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual(output(input));
    });
  });

  describe('Environment getters', () => {
    const address = AztecAddress.random();
    const sender = AztecAddress.random();
    const functionSelector = FunctionSelector.random();
    const transactionFee = Fr.random();
    const chainId = Fr.random();
    const version = Fr.random();
    const blockNumber = Fr.random();
    const timestamp = new Fr(randomInt(100000)); // cap timestamp since must fit in u64
    const feePerDaGas = Fr.random();
    const feePerL2Gas = Fr.random();
    const gasFees = new GasFees(feePerDaGas, feePerL2Gas);
    const globals = initGlobalVariables({
      chainId,
      version,
      blockNumber,
      timestamp,
      gasFees,
    });
    const env = initExecutionEnvironment({
      address,
      sender,
      functionSelector,
      transactionFee,
      globals,
    });
    let context: AvmContext;
    beforeEach(() => {
      context = initContext({ env });
    });

    it.each([
      ['address', address.toField(), 'get_address'],
      ['sender', sender.toField(), 'get_sender'],
      ['transactionFee', transactionFee.toField(), 'get_transaction_fee'],
      ['chainId', chainId.toField(), 'get_chain_id'],
      ['version', version.toField(), 'get_version'],
      ['blockNumber', blockNumber.toField(), 'get_block_number'],
      ['timestamp', timestamp.toField(), 'get_timestamp'],
      ['feePerDaGas', feePerDaGas.toField(), 'get_fee_per_da_gas'],
      ['feePerL2Gas', feePerL2Gas.toField(), 'get_fee_per_l2_gas'],
    ])('%s getter', async (_name: string, value: Fr, functionName: string) => {
      const bytecode = getAvmTestContractBytecode(functionName);
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);

      const returnData = results.output;
      expect(returnData).toEqual([value]);
    });
  });

  it('conversions', async () => {
    const calldata: Fr[] = [new Fr(0b1011101010100)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('to_radix_le');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    const expectedResults = Buffer.concat('0010101011'.split('').map(c => new Fr(Number(c)).toBuffer()));
    const resultBuffer = Buffer.concat(results.output.map(f => f.toBuffer()));

    expect(resultBuffer.equals(expectedResults)).toBe(true);
  });

  describe('Side effects, world state, nested calls', () => {
    const address = new Fr(1);
    const sender = new Fr(42);
    const leafIndex = new Fr(7);
    const slotNumber = 1; // must update Noir contract if changing this
    const slot = new Fr(slotNumber);
    const listSlotNumber0 = 2; // must update Noir contract if changing this
    const listSlotNumber1 = listSlotNumber0 + 1;
    const listSlot0 = new Fr(listSlotNumber0);
    const listSlot1 = new Fr(listSlotNumber1);
    const value0 = new Fr(420);
    const value1 = new Fr(69);

    let worldStateDB: WorldStateDB;
    let trace: PublicSideEffectTraceInterface;
    let persistableState: AvmPersistableStateManager;

    beforeEach(() => {
      worldStateDB = mock<WorldStateDB>();
      trace = mock<PublicSideEffectTraceInterface>();
      persistableState = initPersistableStateManager({ worldStateDB, trace });
    });

    const createContext = (calldata: Fr[] = []) => {
      return initContext({
        persistableState,
        env: initExecutionEnvironment({ address, sender, calldata }),
      });
    };

    // Will check existence at leafIndex, but nothing may be found there and/or something may be found at mockAtLeafIndex
    describe.each([
      [/*mockAtLeafIndex=*/ undefined], // doesn't exist at all
      [/*mockAtLeafIndex=*/ leafIndex], // should be found!
      [/*mockAtLeafIndex=*/ leafIndex.add(Fr.ONE)], // won't be found! (checking leafIndex+1, but it exists at leafIndex)
    ])('Note hash checks', (mockAtLeafIndex?: Fr) => {
      const expectFound = mockAtLeafIndex !== undefined && mockAtLeafIndex.equals(leafIndex);
      const existsElsewhere = mockAtLeafIndex !== undefined && !mockAtLeafIndex.equals(leafIndex);
      const existsStr = expectFound ? 'DOES exist' : 'does NOT exist';
      const foundAtStr = existsElsewhere
        ? `at leafIndex=${mockAtLeafIndex.toNumber()} (exists at leafIndex=${leafIndex.toNumber()})`
        : '';
      it(`Should return ${expectFound} (and be traced) when noteHash ${existsStr} ${foundAtStr}`, async () => {
        const calldata = [value0, leafIndex];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('note_hash_exists');
        if (mockAtLeafIndex !== undefined) {
          mockNoteHashExists(worldStateDB, mockAtLeafIndex, value0);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([expectFound ? Fr.ONE : Fr.ZERO]);
        const expectedValue = results.output[0].toNumber() === 1 ? value0 : Fr.ZERO;
        expect(trace.traceNoteHashCheck).toHaveBeenCalledTimes(1);
        expect(trace.traceNoteHashCheck).toHaveBeenCalledWith(
          address,
          /*noteHash=*/ expectedValue,
          leafIndex,
          /*exists=*/ expectFound,
        );
      });
    });

    describe.each([[/*exists=*/ false], [/*exists=*/ true]])('Nullifier checks', (exists: boolean) => {
      const existsStr = exists ? 'DOES exist' : 'does NOT exist';
      it(`Should return ${exists} (and be traced) when nullifier ${existsStr}`, async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('nullifier_exists');

        if (exists) {
          mockNullifierExists(worldStateDB, leafIndex, value0);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([exists ? Fr.ONE : Fr.ZERO]);

        expect(trace.traceNullifierCheck).toHaveBeenCalledTimes(1);
        const isPending = false;
        // leafIndex is returned from DB call for nullifiers, so it is absent on DB miss
        const tracedLeafIndex = exists && !isPending ? leafIndex : Fr.ZERO;
        expect(trace.traceNullifierCheck).toHaveBeenCalledWith(
          address,
          /*nullifier=*/ value0,
          tracedLeafIndex,
          exists,
          isPending,
        );
      });
    });

    // Will check existence at leafIndex, but nothing may be found there and/or something may be found at mockAtLeafIndex
    describe.each([
      [/*mockAtLeafIndex=*/ undefined], // doesn't exist at all
      [/*mockAtLeafIndex=*/ leafIndex], // should be found!
      [/*mockAtLeafIndex=*/ leafIndex.add(Fr.ONE)], // won't be found! (checking leafIndex+1, but it exists at leafIndex)
    ])('L1ToL2 message checks', (mockAtLeafIndex?: Fr) => {
      const expectFound = mockAtLeafIndex !== undefined && mockAtLeafIndex.equals(leafIndex);
      const existsElsewhere = mockAtLeafIndex !== undefined && !mockAtLeafIndex.equals(leafIndex);
      const existsStr = expectFound ? 'DOES exist' : 'does NOT exist';
      const foundAtStr = existsElsewhere
        ? `at leafIndex=${mockAtLeafIndex.toNumber()} (exists at leafIndex=${leafIndex.toNumber()})`
        : '';

      it(`Should return ${expectFound} (and be traced) when message ${existsStr} ${foundAtStr}`, async () => {
        const calldata = [value0, leafIndex];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('l1_to_l2_msg_exists');
        if (mockAtLeafIndex !== undefined) {
          mockL1ToL2MessageExists(worldStateDB, mockAtLeafIndex, value0, /*valueAtOtherIndices=*/ value1);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([expectFound ? Fr.ONE : Fr.ZERO]);

        expect(trace.traceL1ToL2MessageCheck).toHaveBeenCalledTimes(1);
        let expectedValue = results.output[0].toNumber() === 1 ? value0 : value1;
        if (mockAtLeafIndex === undefined) {
          expectedValue = Fr.ZERO;
        }
        expect(trace.traceL1ToL2MessageCheck).toHaveBeenCalledWith(
          address,
          /*msgHash=*/ expectedValue,
          leafIndex,
          /*exists=*/ expectFound,
        );
      });
    });

    it('Should append a new note hash correctly', async () => {
      const calldata = [value0];
      const context = createContext(calldata);
      const bytecode = getAvmTestContractBytecode('new_note_hash');

      const results = await new AvmSimulator(context).executeBytecode(bytecode);
      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([]);

      expect(trace.traceNewNoteHash).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNoteHash).toHaveBeenCalledWith(expect.objectContaining(address), /*noteHash=*/ value0);
    });

    it('Should append a new nullifier correctly', async () => {
      const calldata = [value0];
      const context = createContext(calldata);
      const bytecode = getAvmTestContractBytecode('new_nullifier');

      const results = await new AvmSimulator(context).executeBytecode(bytecode);
      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([]);

      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNullifier).toHaveBeenCalledWith(expect.objectContaining(address), /*nullifier=*/ value0);
    });

    describe('Cached nullifiers', () => {
      it(`Emits a nullifier and checks its existence`, async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('emit_nullifier_and_check');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        // New nullifier and nullifier existence check should be traced
        expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
        expect(trace.traceNewNullifier).toHaveBeenCalledWith(expect.objectContaining(address), /*nullifier=*/ value0);
        expect(trace.traceNullifierCheck).toHaveBeenCalledTimes(1);
        // leafIndex is returned from DB call for nullifiers, so it is absent on DB miss
        expect(trace.traceNullifierCheck).toHaveBeenCalledWith(
          address,
          /*nullifier=*/ value0,
          /*leafIndex=*/ Fr.ZERO,
          /*exists=*/ true,
          /*isPending=*/ true,
        );
      });
      it(`Emits same nullifier twice (expect failure)`, async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('nullifier_collision');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(true);
        expect(results.revertReason?.message).toMatch(/Attempted to emit duplicate nullifier/);

        // Nullifier should be traced exactly once
        expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
        expect(trace.traceNewNullifier).toHaveBeenCalledWith(expect.objectContaining(address), /*nullifier=*/ value0);
      });
    });

    describe('Unencrypted Logs', () => {
      it(`Emit unencrypted logs (should be traced)`, async () => {
        const context = createContext();
        const bytecode = getAvmTestContractBytecode('emit_unencrypted_log');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        const expectedFields = [new Fr(10), new Fr(20), new Fr(30)];
        const expectedString = 'Hello, world!'.split('').map(c => new Fr(c.charCodeAt(0)));
        const expectedCompressedString = [
          '\0A long time ago, in a galaxy fa',
          '\0r far away...\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0',
        ].map(s => new Fr(Buffer.from(s)));

        expect(trace.traceUnencryptedLog).toHaveBeenCalledTimes(3);
        expect(trace.traceUnencryptedLog).toHaveBeenCalledWith(address, expectedFields);
        expect(trace.traceUnencryptedLog).toHaveBeenCalledWith(address, expectedString);
        expect(trace.traceUnencryptedLog).toHaveBeenCalledWith(address, expectedCompressedString);
      });
    });

    describe('Public storage accesses', () => {
      it('Should set value in storage (single)', async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(await context.persistableState.peekStorage(address, slot)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot, value0);
      });

      it('Should read value in storage (single)', async () => {
        const context = createContext();
        mockStorageRead(worldStateDB, value0);

        const bytecode = getAvmTestContractBytecode('read_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);

        expect(trace.tracePublicStorageRead).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          slot,
          value0,
          /*exists=*/ true,
          /*cached=*/ false,
        );
      });

      it('Should set and read a value from storage (single)', async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_read_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot, value0);
        expect(trace.tracePublicStorageRead).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          slot,
          value0,
          /*exists=*/ true,
          /*cached=*/ true,
        );
      });

      it('Should set a value in storage (list)', async () => {
        const calldata = [value0, value1];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_list');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(await context.persistableState.peekStorage(address, listSlot0)).toEqual(calldata[0]);
        expect(await context.persistableState.peekStorage(address, listSlot1)).toEqual(calldata[1]);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(2);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, listSlot0, value0);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, listSlot1, value1);
      });

      it('Should read a value in storage (list)', async () => {
        const context = createContext();
        const mockedStorage = new Map([
          [listSlot0.toBigInt(), value0],
          [listSlot1.toBigInt(), value1],
        ]);
        mockStorageReadWithMap(worldStateDB, mockedStorage);

        const bytecode = getAvmTestContractBytecode('read_storage_list');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0, value1]);

        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          listSlot0,
          value0,
          /*exists=*/ true,
          /*cached=*/ false,
        );
        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          listSlot1,
          value1,
          /*exists=*/ true,
          /*cached=*/ false,
        );
      });

      it('Should set a value in storage (map)', async () => {
        const calldata = [address, value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        // returns the storage slot for modified key
        const mapSlotNumber = results.output[0].toBigInt();
        const mapSlot = new Fr(mapSlotNumber);

        expect(await context.persistableState.peekStorage(address, mapSlot)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, mapSlot, value0);
      });

      it('Should read-add-set a value in storage (map)', async () => {
        const calldata = [address, value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('add_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        // returns the storage slot for modified key
        const mapSlotNumber = results.output[0].toBigInt();
        const mapSlot = new Fr(mapSlotNumber);

        expect(await context.persistableState.peekStorage(address, mapSlot)).toEqual(value0);

        expect(trace.tracePublicStorageRead).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          mapSlot,
          Fr.ZERO,
          /*exists=*/ false,
          /*cached=*/ false,
        );
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, mapSlot, value0);
      });

      it('Should read value in storage (map)', async () => {
        const calldata = [address];

        const context = createContext(calldata);
        mockStorageRead(worldStateDB, value0);
        const bytecode = getAvmTestContractBytecode('read_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);

        expect(trace.tracePublicStorageRead).toHaveBeenCalledTimes(1);
        // slot is the result of a pedersen hash and is therefore not known in the test
        expect(trace.tracePublicStorageRead).toHaveBeenCalledWith(
          address,
          expect.anything(),
          value0,
          /*exists=*/ true,
          /*cached=*/ false,
        );
      });
    });

    describe('Contract Instance Retrieval', () => {
      it(`Can getContractInstance`, async () => {
        const calldata = [address];
        const context = createContext(calldata);
        // Contract instance must match noir
        const contractInstance = new SerializableContractInstance({
          version: 1 as const,
          salt: new Fr(0x123),
          deployer: AztecAddress.fromBigInt(0x456n),
          contractClassId: new Fr(0x789),
          initializationHash: new Fr(0x101112),
          publicKeys: new PublicKeys(
            new Point(new Fr(0x131415), new Fr(0x161718), false),
            new Point(new Fr(0x192021), new Fr(0x222324), false),
            new Point(new Fr(0x252627), new Fr(0x282930), false),
            new Point(new Fr(0x313233), new Fr(0x343536), false),
          ),
        });
        mockGetContractInstance(worldStateDB, contractInstance.withAddress(address));

        const bytecode = getAvmTestContractBytecode('test_get_contract_instance');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(trace.traceGetContractInstance).toHaveBeenCalledTimes(3); // called for each enum value
        expect(trace.traceGetContractInstance).toHaveBeenCalledWith(address, /*exists=*/ true, contractInstance);
      });
    });

    describe('Nested external calls', () => {
      const expectTracedNestedCall = (
        environment: AvmExecutionEnvironment,
        nestedTrace: PublicSideEffectTraceInterface,
        isStaticCall: boolean = false,
      ) => {
        expect(trace.traceNestedCall).toHaveBeenCalledTimes(1);
        expect(trace.traceNestedCall).toHaveBeenCalledWith(
          /*nestedCallTrace=*/ nestedTrace,
          /*nestedEnvironment=*/ expect.objectContaining({
            sender: environment.address, // sender is top-level call
            contractCallDepth: new Fr(1), // top call is depth 0, nested is depth 1
            globals: environment.globals, // just confirming that nested env looks roughly right
            isStaticCall: isStaticCall,
            // TODO(7121): can't check calldata like this since it is modified on environment construction
            // with AvmContextInputs. These should eventually go away.
            //calldata: expect.arrayContaining(environment.calldata), // top-level call forwards args
          }),
          /*startGasLeft=*/ expect.anything(),
          /*endGasLeft=*/ expect.anything(),
          /*bytecode=*/ expect.anything(),
          /*avmCallResults=*/ expect.anything(), // we don't have the NESTED call's results to check
          /*functionName=*/ expect.anything(),
        );
      };

      it(`Nested call`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_add');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0.add(value1)]);

        expectTracedNestedCall(context.environment, nestedTrace);
      });

      it(`Nested static call`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_add');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0.add(value1)]);

        expectTracedNestedCall(context.environment, nestedTrace, /*isStaticCall=*/ true);
      });

      it(`Nested call with not enough gas (expect failure)`, async () => {
        const gas = [/*l2=*/ 5, /*da=*/ 10000].map(g => new Fr(g));
        const calldata: Fr[] = [value0, value1, ...gas];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_add_with_gas');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        // TODO(7141): change this once we don't force rethrowing of exceptions.
        // Outer frame should not revert, but inner should, so the forwarded return value is 0
        // expect(results.revertReason).toBeUndefined();
        // expect(results.reverted).toBe(false);
        expect(results.reverted).toBe(true);
        expect(results.revertReason?.message).toEqual('Not enough L2GAS gas left');

        // Nested call should NOT have been made and therefore should not be traced
        expect(trace.traceNestedCall).toHaveBeenCalledTimes(0);
      });

      it(`Nested static call which modifies storage (expect failure)`, async () => {
        const context = createContext();
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_set_storage');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(true); // The outer call should revert.
        expect(results.revertReason?.message).toEqual(
          'Static call cannot update the state, emit L2->L1 messages or generate logs',
        );

        // TODO(7141): external call doesn't recover from nested exception until
        // we support recoverability of reverts (here and in kernel)
        //expectTracedNestedCall(context.environment, results, nestedTrace, /*isStaticCall=*/true);

        // Nested call should NOT have been able to write storage
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(0);
      });

      it(`Nested calls rethrow exceptions`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_assert_same');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(true); // The outer call should revert.
        expect(results.revertReason).toBeDefined();
        expect(resolveAvmTestContractAssertionMessage('public_dispatch', results.revertReason!)).toMatch(
          'Values are not equal',
        );
      });

      it('Should handle returndatacopy oracle', async () => {
        const context = createContext();
        const callBytecode = getAvmTestContractBytecode('returndata_copy_oracle');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');
        mockGetBytecode(worldStateDB, nestedBytecode);

        const contractClass = makeContractClassPublic(0, {
          bytecode: nestedBytecode,
          selector: FunctionSelector.random(),
        });
        mockGetContractClass(worldStateDB, contractClass);
        const contractInstance = makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(worldStateDB, contractInstance);

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
      });
    });

    describe('Side effect trace errors on overflow', () => {
      const trace = new PublicEnqueuedCallSideEffectTrace();
      const persistableState = initPersistableStateManager({ worldStateDB, trace });

      it.each([
        ['Public storage writes', () => new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 0)],
        ['Public storage reads', () => new SLoad(/*indirect=*/ 0, /*slotOffset=*/ 0, /*dstOffset=*/ 0)],
        [
          'Note hash checks',
          () => new NoteHashExists(/*indirect=*/ 0, /*noteHashOffset=*/ 0, /*leafIndexOffest=*/ 0, /*existsOffset=*/ 1),
        ],
        ['New note hashes', () => new EmitNoteHash(/*indirect=*/ 0, /*noteHashOffset=*/ 0)],
        [
          'Nullifier checks',
          () => new NullifierExists(/*indirect=*/ 0, /*nullifierOffset=*/ 0, /*addressOffest=*/ 0, /*existsOffset=*/ 1),
        ],
        ['New nullifiers', () => new EmitNullifier(/*indirect=*/ 0, /*noteHashOffset=*/ 0)],
        [
          'L1 to L2 message checks',
          () =>
            new L1ToL2MessageExists(
              /*indirect=*/ 0,
              /*msgHashOffset=*/ 0,
              /*msgLeafIndexOffest=*/ 0,
              /*existsOffset=*/ 1,
            ),
        ],
        ['New unencrypted logs', () => new EmitUnencryptedLog(/*indirect=*/ 0, /*logOffset=*/ 0, /*logSizeOffest=*/ 1)],
        [
          'New L1 to L2 messages',
          () => new SendL2ToL1Message(/*indirect=*/ 0, /*recipientOffset=*/ 0, /*contentOffest=*/ 0),
        ],
      ])(`Overrun of %s`, async (_sideEffectType: string, createInstr: () => Instruction) => {
        const bytecode = encodeToBytecode([
          new Set(/*indirect*/ 0, TypeTag.FIELD, /*value*/ 0, /*dstOffset*/ 0).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect*/ 0, TypeTag.FIELD, /*value*/ 100, /*dstOffset*/ 100).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect*/ 0, TypeTag.UINT32, /*value*/ 1, /*dstOffset*/ 1).as(Opcode.SET_8, Set.wireFormat8),
          createInstr(),
          // change value at memory offset 0 so each instr operates on a different value (important for nullifier emission)
          new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 100, /*dstOffset=*/ 0).as(
            Opcode.ADD_8,
            Add.wireFormat8,
          ),
          // infinitely loop back to the tested instruction
          // infinite loop should break on side effect overrun error,
          // but otherwise will run out of gas
          new Jump(/*jumpOffset*/ 2),
        ]);
        const context = initContext({ persistableState });
        const results = await new AvmSimulator(context).executeBytecode(markBytecodeAsAvm(bytecode));
        expect(results.reverted).toBe(true);
        expect(results.output).toEqual([]);
        expect(results.revertReason?.message).toMatch('Reached the limit');
      });
    });
  });
});

function sha256FromMemoryBytes(bytes: Uint8[]): Fr[] {
  return [...sha256(Buffer.concat(bytes.map(b => b.toBuffer())))].map(b => new Fr(b));
}

function keccak256FromMemoryBytes(bytes: Uint8[]): Fr[] {
  return [...keccak256(Buffer.concat(bytes.map(b => b.toBuffer())))].map(b => new Fr(b));
}

function keccakF1600FromMemoryUint64s(mem: Uint64[]): Fr[] {
  return [...keccakf1600(mem.map(u => u.toBigInt()))].map(b => new Fr(b));
}

function poseidon2FromMemoryFields(fields: Fieldable[]): Fr[] {
  return [poseidon2Hash(fields)];
}

function pedersenFromMemoryFields(fields: Fieldable[]): Fr[] {
  return [pedersenHash(fields)];
}

function indexedPedersenFromMemoryFields(fields: Fieldable[]): Fr[] {
  return [pedersenHash(fields, /*index=*/ 20)];
}
