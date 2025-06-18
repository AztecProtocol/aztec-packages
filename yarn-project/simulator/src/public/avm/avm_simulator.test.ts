import { DEPLOYER_CONTRACT_ADDRESS } from '@aztec/constants';
import {
  Grumpkin,
  keccak256,
  keccakf1600,
  pedersenCommit,
  pedersenHash,
  poseidon2Hash,
  sha256,
} from '@aztec/foundation/crypto';
import { Fq, Fr, Point } from '@aztec/foundation/fields';
import type { Fieldable } from '@aztec/foundation/serialize';
import { AvmGadgetsTestContract } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { AvmTestContract } from '@aztec/noir-test-contracts.js/AvmTest';
import { NoteGetterContract } from '@aztec/noir-test-contracts.js/NoteGetter';
import { type FunctionArtifact, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance, computePublicBytecodeCommitment } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import {
  computeNoteHashNonce,
  computeUniqueNoteHash,
  computeVarArgsHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/stdlib/hash';
import { PublicKeys } from '@aztec/stdlib/keys';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/stdlib/testing';
import { NativeWorldStateService } from '@aztec/world-state';

import { strict as assert } from 'assert';
import { randomInt } from 'crypto';
import { mock } from 'jest-mock-extended';

import { SideEffectTrace } from '../../public/side_effect_trace.js';
import type { PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { SimpleContractDataSource } from '../fixtures/simple_contract_data_source.js';
import { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import type { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import type { AvmContext } from './avm_context.js';
import type { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { type MemoryValue, TypeTag, type Uint8, type Uint64 } from './avm_memory_types.js';
import { AvmSimulator } from './avm_simulator.js';
import { AvmRevertReason } from './errors.js';
import {
  initContext,
  initExecutionEnvironment,
  initGlobalVariables,
  initMachineState,
  initPersistableStateManager,
} from './fixtures/initializers.js';
import {
  getContractFunctionArtifact,
  randomMemoryBytes,
  randomMemoryFields,
  randomMemoryUint64s,
  resolveContractAssertionMessage,
} from './fixtures/utils.js';
import {
  Add,
  CalldataCopy,
  Div,
  EmitNoteHash,
  EmitNullifier,
  EmitUnencryptedLog,
  type Instruction,
  Jump,
  Return,
  SStore,
  SendL2ToL1Message,
  Set,
} from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';
import { Opcode } from './serialization/instruction_serialization.js';
import {
  mockCheckNullifierExists,
  mockGetBytecodeCommitment,
  mockGetContractClass,
  mockGetContractInstance,
  mockL1ToL2MessageExists,
  mockNoteHashCount,
  mockNoteHashExists,
  mockStorageRead,
  mockStorageReadWithMap,
  mockTraceFork,
} from './test_utils.js';

const siloAddress = (contractAddress: AztecAddress) => {
  const contractAddressNullifier = siloNullifier(
    AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
    contractAddress.toField(),
  );
  return contractAddressNullifier;
};

describe('AVM simulator: injected bytecode', () => {
  let calldata: Fr[];
  let bytecode: Buffer;

  beforeAll(() => {
    calldata = [new Fr(1), new Fr(2)];
    bytecode = encodeToBytecode([
      new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.UINT32, /*value*/ 0).as(Opcode.SET_8, Set.wireFormat8),
      new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /*value*/ 2).as(Opcode.SET_8, Set.wireFormat8),
      new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0),
      new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
      new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.UINT32, /*value*/ 1).as(Opcode.SET_8, Set.wireFormat8),
      new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 2),
    ]);
  });

  it('Should execute bytecode that performs basic addition', async () => {
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(3)]);
  });

  it('Should halt if runs out of gas', async () => {
    const context = initContext({
      env: initExecutionEnvironment({ calldata }),
      machineState: initMachineState({ l2GasLeft: 5 }),
    });

    const results = await new AvmSimulator(context).executeBytecode(bytecode);
    expect(results.reverted).toBe(true);
    expect(results.output).toEqual([]);
    expect(results.revertReason?.message).toEqual('Not enough L2GAS gas left');
    expect(results.gasLeft.l2Gas).toEqual(0);
    expect(results.gasLeft.daGas).toEqual(0);
  });

  it('An exceptional halt should consume all allocated gas', async () => {
    const context = initContext();

    // should halt with tag mismatch
    const badBytecode = encodeToBytecode([
      new Div(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 0, /*dstOffset=*/ 0).as(Opcode.DIV_8, Div.wireFormat8),
    ]);
    const results = await new AvmSimulator(context).executeBytecode(badBytecode);
    expect(results.reverted).toBe(true);
    expect(results.output).toEqual([]);
    expect(results.revertReason?.message).toMatch(/Tag mismatch/);
    expect(results.gasLeft.l2Gas).toEqual(0);
    expect(results.gasLeft.daGas).toEqual(0);
  });
});

describe('AVM simulator: transpiled Noir contracts', () => {
  it('execution of a non-existent contract immediately reverts and consumes all allocated gas', async () => {
    const context = initContext();
    const results = await new AvmSimulator(context).execute();

    expect(results.reverted).toBe(true);
    expect(results.output).toEqual([]);
    expect(results.gasLeft).toEqual({ l2Gas: 0, daGas: 0 });
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
      (await FunctionSelector.fromSignature('add_args_return(Field,Field)')).toField(),
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
    const selector = await FunctionSelector.fromSignature('get_args_hash(u8,[Field;3])');
    const args = [new Fr(8), new Fr(1), new Fr(2), new Fr(3)];
    const dispatchCalldata = [selector.toField(), ...args];

    const context = initContext({ env: initExecutionEnvironment({ calldata: dispatchCalldata }) });
    const bytecode = getAvmTestContractBytecode('public_dispatch');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([await computeVarArgsHash(args)]);
  });

  it('modulo and u1', async () => {
    const calldata: Fr[] = [new Fr(2)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('modulo2');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(0)]);
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
    const g3 = await grumpkin.mul(grumpkin.generator(), new Fq(3));
    expect(results.output).toEqual([g3.x, g3.y, Fr.ZERO]);
  });

  describe('msm', () => {
    it('low scalars', async () => {
      const calldata: Fr[] = [
        /* scalar lo */ new Fr(3),
        /* scalar hi */ new Fr(0),
        /* scalar2 lo */ new Fr(20),
        /* scalar2 hi */ new Fr(0),
      ];
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('variable_base_msm');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      const grumpkin = new Grumpkin();
      const g3 = await grumpkin.mul(grumpkin.generator(), new Fq(3));
      const g20 = await grumpkin.mul(grumpkin.generator(), new Fq(20));
      const expectedResult = await grumpkin.add(g3, g20);
      expect(results.output).toEqual([expectedResult.x, expectedResult.y, Fr.ZERO]);
    });

    it('with a zero', async () => {
      const calldata: Fr[] = [
        /* scalar lo */ new Fr(3),
        /* scalar hi */ new Fr(0),
        /* scalar2 lo */ new Fr(0),
        /* scalar2 hi */ new Fr(0),
      ];
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('variable_base_msm');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      const grumpkin = new Grumpkin();
      const expectedResult = await grumpkin.mul(grumpkin.generator(), new Fq(3));
      expect(results.output).toEqual([expectedResult.x, expectedResult.y, Fr.ZERO]);
    });

    const fqToLimbs = (fq: Fq): [bigint, bigint] => {
      const asBigint = fq.toBigInt();
      // Return lo, hi limbs of 128 bits
      const hi = asBigint >> 128n;
      const lo = asBigint & (2n ** 128n - 1n);
      return [lo, hi];
    };

    it('high scalars', async () => {
      const scalar = new Fq(Fq.MODULUS - 1n);
      const scalar2 = new Fq(Fq.MODULUS - 2n);

      const calldata: Fr[] = [...fqToLimbs(scalar), ...fqToLimbs(scalar2)].map(bigint => new Fr(bigint));
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('variable_base_msm');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      const grumpkin = new Grumpkin();
      const g1 = await grumpkin.mul(grumpkin.generator(), scalar);
      const g2 = await grumpkin.mul(grumpkin.generator(), scalar2);
      const expectedResult = await grumpkin.add(g1, g2);
      expect(results.output).toEqual([expectedResult.x, expectedResult.y, Fr.ZERO]);
    });
  });

  it('pedersen commitment operations', async () => {
    const calldata: Fr[] = [new Fr(100), new Fr(1)];
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });

    const bytecode = getAvmTestContractBytecode('pedersen_commit');
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    // This doesnt include infinites
    const expectedResult = (await pedersenCommit([Buffer.from([100]), Buffer.from([1])], 20)).map(f => new Fr(f));
    // TODO: Come back to the handling of infinities when we confirm how they're handled in bb
    const isInf = expectedResult[0] === new Fr(0) && expectedResult[1] === new Fr(0);
    expectedResult.push(new Fr(isInf));
    expect(results.output).toEqual(expectedResult);
  });

  it('conditional move operations', async () => {
    const calldata: Fr[] = [new Fr(27), new Fr(28), new Fr(1)];

    const bytecode = getAvmTestContractBytecode('conditional_move');

    let context = initContext({ env: initExecutionEnvironment({ calldata }) });
    let results = await new AvmSimulator(context).executeBytecode(bytecode);
    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(27)]);

    calldata[2] = new Fr(0);
    context = initContext({ env: initExecutionEnvironment({ calldata }) });
    results = await new AvmSimulator(context).executeBytecode(bytecode);
    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(28)]);
  });

  describe('U128 addition and overflows', () => {
    it('U128 addition', async () => {
      const calldata: Fr[] = [
        // First U128
        new Fr(1),
        // Second U128
        new Fr(2),
      ];
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('add_u128');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([new Fr(3)]);
    });

    it('Expect failure on U128::add() overflow', async () => {
      const bytecode = getAvmTestContractBytecode('u128_addition_overflow');
      const results = await new AvmSimulator(initContext()).executeBytecode(bytecode);
      expect(results.reverted).toBe(true);
      expect(results.revertReason).toBeDefined();
      expect(
        resolveAvmTestContractAssertionMessage('u128_addition_overflow', results.revertReason!, results.output),
      ).toMatch('attempt to add with overflow');
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
    expect(results.output).toHaveLength(1); // Error selector for static string error
    expect(
      resolveAvmTestContractAssertionMessage('assert_nullifier_exists', results.revertReason!, results.output),
    ).toMatch("Nullifier doesn't exist!");
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

  /*
   * Can run these as follows to measure sha256 instruction execution counts:
   * for i in 10 20 30 40 50 60 70 80 90 100 255 256 511 512 2048; do
   *   echo sha-ing $i...;
   *   LOG_LEVEL=debug yarn test src/avm/avm_simulator.test.ts -t "sha256_hash_$i " &> sha$i.log;
   * done
   * for i in 10 20 30 40 50 60 70 80 90 100 255 256 511 512 2048; do
   *   echo sha256 of $i bytes $(grep -Eo 'Executed .* instructions.* Gas' sha$i.log);
   * done
   */
  describe.each([
    ['sha256_hash_10', /*input=*/ randomMemoryBytes(10), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_20', /*input=*/ randomMemoryBytes(20), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_30', /*input=*/ randomMemoryBytes(30), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_40', /*input=*/ randomMemoryBytes(40), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_50', /*input=*/ randomMemoryBytes(50), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_60', /*input=*/ randomMemoryBytes(60), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_70', /*input=*/ randomMemoryBytes(70), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_80', /*input=*/ randomMemoryBytes(80), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_90', /*input=*/ randomMemoryBytes(90), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_100', /*input=*/ randomMemoryBytes(100), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_255', /*input=*/ randomMemoryBytes(255), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_256', /*input=*/ randomMemoryBytes(256), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_511', /*input=*/ randomMemoryBytes(511), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_512', /*input=*/ randomMemoryBytes(512), /*output=*/ sha256FromMemoryBytes],
    ['sha256_hash_2048', /*input=*/ randomMemoryBytes(2048), /*output=*/ sha256FromMemoryBytes],
    ['keccak_hash', /*input=*/ randomMemoryBytes(10), /*output=*/ keccak256FromMemoryBytes],
    ['keccak_f1600', /*input=*/ randomMemoryUint64s(25), /*output=*/ keccakF1600FromMemoryUint64s],
    ['poseidon2_hash', /*input=*/ randomMemoryFields(10), /*output=*/ poseidon2FromMemoryFields],
    ['pedersen_hash', /*input=*/ randomMemoryFields(10), /*output=*/ pedersenFromMemoryFields],
    ['pedersen_hash_with_index', /*input=*/ randomMemoryFields(10), /*output=*/ indexedPedersenFromMemoryFields],
  ])('Hashes in noir contracts', (name: string, input: MemoryValue[], output: (msg: any[]) => Promise<Fr[]>) => {
    it(`Should execute contract function that performs ${name} on input of length ${input.length}`, async () => {
      const calldata = input.map(e => e.toFr());

      const context = initContext({ env: initExecutionEnvironment({ calldata }) });
      const bytecode = getAvmGadgetsTestContractArtifact(name).bytecode;
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual(await output(input));
    });
  });

  describe('Environment getters', () => {
    let env: AvmExecutionEnvironment;
    let context: AvmContext;
    let address: AztecAddress;
    let sender: AztecAddress;

    const transactionFee = Fr.random();
    const chainId = Fr.random();
    const version = Fr.random();
    const blockNumber = randomInt(20000);
    const timestamp = BigInt(randomInt(100000)); // timestamp as UInt64
    const gasFees = GasFees.random();

    beforeAll(async () => {
      address = await AztecAddress.random();
      sender = await AztecAddress.random();

      const globals = initGlobalVariables({
        chainId,
        version,
        blockNumber,
        timestamp,
        gasFees,
      });
      env = initExecutionEnvironment({
        address,
        sender,
        transactionFee,
        globals,
      });
    });

    beforeEach(() => {
      context = initContext({ env });
    });

    it.each([
      ['address', () => address.toField(), 'get_address'],
      ['sender', () => sender.toField(), 'get_sender'],
      ['transactionFee', () => transactionFee.toField(), 'get_transaction_fee'],
      ['chainId', () => chainId.toField(), 'get_chain_id'],
      ['version', () => version.toField(), 'get_version'],
      ['blockNumber', () => new Fr(blockNumber), 'get_block_number'],
      ['timestamp', () => new Fr(timestamp), 'get_timestamp'],
      ['feePerDaGas', () => new Fr(gasFees.feePerDaGas), 'get_fee_per_da_gas'],
      ['feePerL2Gas', () => new Fr(gasFees.feePerL2Gas), 'get_fee_per_l2_gas'],
    ])('%s getter', async (_name: string, valueGetter: () => Fr, functionName: string) => {
      const value = valueGetter();
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
    expect(results.output.map(f => f.toNumber().toString()).join('')).toEqual('0010101011');
  });

  describe('Side effects, world state, nested calls', () => {
    const address = AztecAddress.fromNumber(1);
    const sender = AztecAddress.fromNumber(42);
    const leafIndex = new Fr(7);
    const slotNumber = 1; // must update Noir contract if changing this
    const slot = new Fr(slotNumber);
    const listSlotNumber0 = 2; // must update Noir contract if changing this
    const listSlotNumber1 = listSlotNumber0 + 1;
    const listSlot0 = new Fr(listSlotNumber0);
    const listSlot1 = new Fr(listSlotNumber1);
    const value0 = new Fr(420);
    const value1 = new Fr(69);
    const firstNullifier = new Fr(99);
    let siloedNullifier0: Fr;

    let treesDB: PublicTreesDB;
    let contractsDB: PublicContractsDB;
    let trace: PublicSideEffectTraceInterface;
    let persistableState: PublicPersistableStateManager;

    beforeAll(async () => {
      siloedNullifier0 = await siloNullifier(address, value0);
    });

    beforeEach(() => {
      treesDB = mock<PublicTreesDB>();
      contractsDB = mock<PublicContractsDB>();
      trace = mock<PublicSideEffectTraceInterface>();
      persistableState = initPersistableStateManager({ treesDB, contractsDB, trace, firstNullifier });
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
          mockNoteHashExists(treesDB, mockAtLeafIndex, value0);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([expectFound ? Fr.ONE : Fr.ZERO]);
      });
    });

    describe.each([[/*exists=*/ false], [/*exists=*/ true]])('Nullifier checks', (exists: boolean) => {
      const existsStr = exists ? 'DOES exist' : 'does NOT exist';
      it(`Should return ${exists} (and be traced) when nullifier ${existsStr}`, async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('nullifier_exists');

        if (exists) {
          mockCheckNullifierExists(treesDB, true, siloedNullifier0);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([exists ? Fr.ONE : Fr.ZERO]);
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
          mockL1ToL2MessageExists(treesDB, mockAtLeafIndex, value0, /*valueAtOtherIndices=*/ value1);
        }

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([expectFound ? Fr.ONE : Fr.ZERO]);
      });
    });

    it('Should append a new note hash correctly', async () => {
      const calldata = [value0];
      const context = createContext(calldata);
      const bytecode = getAvmTestContractBytecode('new_note_hash');
      mockNoteHashCount(trace, 0);

      const results = await new AvmSimulator(context).executeBytecode(bytecode);
      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([]);

      expect(trace.traceNewNoteHash).toHaveBeenCalledTimes(1);
      const siloedNotehash = await siloNoteHash(address, value0);
      const noteNonce = await computeNoteHashNonce(firstNullifier, 0);
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNotehash);
      expect(trace.traceNewNoteHash).toHaveBeenCalledWith(uniqueNoteHash);
    });

    it('Should append a new nullifier correctly', async () => {
      const calldata = [value0];
      const context = createContext(calldata);
      const bytecode = getAvmTestContractBytecode('new_nullifier');

      const results = await new AvmSimulator(context).executeBytecode(bytecode);
      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([]);

      expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
      expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
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
        expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
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
        expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
      });
    });

    describe('Public Logs', () => {
      it(`Emit public logs (should be traced)`, async () => {
        const context = createContext();
        const bytecode = getAvmTestContractBytecode('emit_public_log');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        const expectedFields = [new Fr(10), new Fr(20), new Fr(30)];
        const expectedString = 'Hello, world!'.split('').map(c => new Fr(c.charCodeAt(0)));
        const expectedCompressedString = [
          '\0A long time ago, in a galaxy fa',
          '\0r far away...\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0',
        ].map(s => new Fr(Buffer.from(s)));

        expect(trace.tracePublicLog).toHaveBeenCalledTimes(3);
        expect(trace.tracePublicLog).toHaveBeenCalledWith(address, expectedFields);
        expect(trace.tracePublicLog).toHaveBeenCalledWith(address, expectedString);
        expect(trace.tracePublicLog).toHaveBeenCalledWith(address, expectedCompressedString);
      });
    });

    describe('Public storage accesses', () => {
      it('Should set value in storage (single)', async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(await context.persistableState.readStorage(address, slot)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot, value0, false);
      });

      it('Should read value in storage (single)', async () => {
        const context = createContext();
        mockStorageRead(treesDB, value0);

        const bytecode = getAvmTestContractBytecode('read_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);
      });

      it('Should set and read a value from storage (single)', async () => {
        const calldata = [value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_read_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot, value0, false);
      });

      it('Should set a value in storage (list)', async () => {
        const calldata = [value0, value1];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_list');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(await context.persistableState.readStorage(address, listSlot0)).toEqual(calldata[0]);
        expect(await context.persistableState.readStorage(address, listSlot1)).toEqual(calldata[1]);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(2);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, listSlot0, value0, false);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, listSlot1, value1, false);
      });

      it('Should read a value in storage (list)', async () => {
        const context = createContext();
        const mockedStorage = new Map([
          [listSlot0.toBigInt(), value0],
          [listSlot1.toBigInt(), value1],
        ]);
        mockStorageReadWithMap(treesDB, mockedStorage);

        const bytecode = getAvmTestContractBytecode('read_storage_list');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0, value1]);
      });

      it('Should set a value in storage (map)', async () => {
        const calldata = [address.toField(), value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        // returns the storage slot for modified key
        const mapSlotNumber = results.output[0].toBigInt();
        const mapSlot = new Fr(mapSlotNumber);

        expect(await context.persistableState.readStorage(address, mapSlot)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, mapSlot, value0, false);
      });

      it('Should read-add-set a value in storage (map)', async () => {
        const calldata = [address.toField(), value0];

        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('add_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        // returns the storage slot for modified key
        const mapSlotNumber = results.output[0].toBigInt();
        const mapSlot = new Fr(mapSlotNumber);

        expect(await context.persistableState.readStorage(address, mapSlot)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, mapSlot, value0, false);
      });

      it('Should read value in storage (map)', async () => {
        const calldata = [address.toField()];

        const context = createContext(calldata);
        mockStorageRead(treesDB, value0);
        const bytecode = getAvmTestContractBytecode('read_storage_map');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);
      });
    });

    describe('Contract Instance Retrieval', () => {
      it(`Can getContractInstance`, async () => {
        const calldata = [address.toField()];
        const context = createContext(calldata);
        // Contract instance must match noir
        const contractInstance = new SerializableContractInstance({
          version: 1 as const,
          salt: new Fr(0x123),
          deployer: AztecAddress.fromBigInt(0x456n),
          currentContractClassId: new Fr(0x789),
          originalContractClassId: new Fr(0x789),
          initializationHash: new Fr(0x101112),
          publicKeys: new PublicKeys(
            new Point(new Fr(0x131415), new Fr(0x161718), false),
            new Point(new Fr(0x192021), new Fr(0x222324), false),
            new Point(new Fr(0x252627), new Fr(0x282930), false),
            new Point(new Fr(0x313233), new Fr(0x343536), false),
          ),
        });
        const contractInstanceWithAddress = contractInstance.withAddress(address);
        // mock once per enum value (deployer, classId, initializationHash)
        mockGetContractInstance(contractsDB, contractInstanceWithAddress);
        mockGetContractInstance(contractsDB, contractInstanceWithAddress);
        mockGetContractInstance(contractsDB, contractInstanceWithAddress);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstanceWithAddress.address));
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstanceWithAddress.address));
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstanceWithAddress.address));

        const bytecode = getAvmTestContractBytecode('test_get_contract_instance');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
      });
    });

    describe('Nested external calls', () => {
      it(`Nested call to non-existent contract`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_add');
        // We don't mock getBytecode for the nested contract, so it will not exist
        // which should cause the nested call to immediately revert

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(true);
        expect(results.output).toEqual([]);
      });

      it(`Nested call`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_add');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');

        const contractClass = await makeContractClassPublic(0, nestedBytecode);
        mockGetContractClass(contractsDB, contractClass);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0.add(value1)]);
      });

      it(`Nested static call`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_add');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');

        const contractClass = await makeContractClassPublic(0, nestedBytecode);
        mockGetContractClass(contractsDB, contractClass);
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0.add(value1)]);
      });

      it(`Nested call with not enough gas (expect failure)`, async () => {
        const gas = [/*l2=*/ 5, /*da=*/ 10000].map(g => new Fr(g));
        const targetFunctionSelector = await FunctionSelector.fromSignature(
          'nested_call_to_add_with_gas(Field,Field,u32,u32)',
        );
        const calldata: Fr[] = [targetFunctionSelector.toField(), value0, value1, ...gas];
        const context = createContext(calldata);
        const artifact = getAvmTestContractArtifact('public_dispatch');

        const contractClass = await makeContractClassPublic(0, artifact.bytecode);
        mockGetContractClass(contractsDB, contractClass);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(artifact.bytecode);
        expect(results.reverted).toBe(true);
        expect(results.revertReason?.message).toMatch('Not enough L2GAS gas left');
      });

      it(`Nested static call which modifies storage (expect failure)`, async () => {
        const context = createContext();
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_set_storage');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');

        const contractClass = await makeContractClassPublic(0, nestedBytecode);
        mockGetContractClass(contractsDB, contractClass);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        const nestedTrace = mock<PublicSideEffectTraceInterface>();
        mockTraceFork(trace, nestedTrace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(true); // The outer call should revert.
        expect(results.revertReason?.message).toEqual(
          'Static call cannot update the state, emit L2->L1 messages or generate logs',
        );

        // Nested call should NOT have been able to write storage
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(0);
      });

      it(`Nested calls rethrow exceptions`, async () => {
        const calldata = [value0, value1];
        const context = createContext(calldata);
        const callBytecode = getAvmTestContractBytecode('nested_call_to_assert_same');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');

        const contractClass = await makeContractClassPublic(0, nestedBytecode);
        mockGetContractClass(contractsDB, contractClass);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);
        expect(results.reverted).toBe(true); // The outer call should revert.
        expect(results.revertReason).toBeDefined();
        expect(
          resolveAvmTestContractAssertionMessage('public_dispatch', results.revertReason!, results.output),
        ).toMatch('Values are not equal');
      });

      it('Should handle returndatacopy oracle', async () => {
        const context = createContext();
        const callBytecode = getAvmTestContractBytecode('returndata_copy_oracle');
        const nestedBytecode = getAvmTestContractBytecode('public_dispatch');

        const contractClass = await makeContractClassPublic(0, nestedBytecode);
        mockGetContractClass(contractsDB, contractClass);
        mockGetBytecodeCommitment(contractsDB, await computePublicBytecodeCommitment(contractClass.packedBytecode));
        const contractInstance = await makeContractInstanceFromClassId(contractClass.id);
        mockGetContractInstance(contractsDB, contractInstance);
        mockCheckNullifierExists(treesDB, true, await siloAddress(contractInstance.address));

        mockTraceFork(trace);

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
      });
    });

    describe('Side effect trace errors on overflow', () => {
      const trace = new SideEffectTrace();
      const persistableState = initPersistableStateManager({ treesDB, trace });

      it.each([
        ['Public storage writes', () => new SStore(/*indirect=*/ 0, /*srcOffset=*/ 0, /*slotOffset=*/ 0)],
        ['New note hashes', () => new EmitNoteHash(/*indirect=*/ 0, /*noteHashOffset=*/ 0)],
        ['New nullifiers', () => new EmitNullifier(/*indirect=*/ 0, /*noteHashOffset=*/ 0)],
        ['New unencrypted logs', () => new EmitUnencryptedLog(/*indirect=*/ 0, /*logOffset=*/ 0, /*logSizeOffest=*/ 1)],
        [
          'New L1 to L2 messages',
          () => new SendL2ToL1Message(/*indirect=*/ 0, /*recipientOffset=*/ 0, /*contentOffest=*/ 0),
        ],
      ])(`Overrun of %s`, async (_sideEffectType: string, createInstr: () => Instruction) => {
        const bytecode = encodeToBytecode([
          new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.FIELD, /*value*/ 0).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect*/ 0, /*dstOffset*/ 100, TypeTag.FIELD, /*value*/ 100).as(Opcode.SET_8, Set.wireFormat8),
          new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /*value*/ 1).as(Opcode.SET_8, Set.wireFormat8),
          createInstr(),
          // change value at memory offset 0 so each instr operates on a different value (important for nullifier emission)
          new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 100, /*dstOffset=*/ 0).as(
            Opcode.ADD_8,
            Add.wireFormat8,
          ),
          // infinitely loop back to the tested instruction
          // infinite loop should break on side effect overrun error,
          // but otherwise will run out of gas
          // Note: 15 is the byte index, calculated as 3*size(Set.wireFormat8)
          new Jump(/*jumpOffset*/ 15),
        ]);
        const context = initContext({ persistableState });
        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(true);
        expect(results.output).toEqual([]);
        expect(results.revertReason?.message).toMatch('Reached the limit');
      });
    });
  });

  describe('Side effects including merkle checks', () => {
    const address = AztecAddress.fromNumber(1);
    const sender = AztecAddress.fromNumber(42);

    const value0 = new Fr(420);

    const slotNumber0 = 1; // must update Noir contract if changing this
    const slot0 = new Fr(slotNumber0);

    const firstNullifier = new Fr(333);

    const noteHashIndexInTx = 0;
    let siloedNullifier0: Fr;
    let uniqueNoteHash0: Fr;

    let treesDB: PublicTreesDB;
    let contractsDB: PublicContractsDB;
    let trace: PublicSideEffectTraceInterface;
    let persistableState: PublicPersistableStateManager;

    beforeAll(async () => {
      siloedNullifier0 = await siloNullifier(address, value0);
      const siloedNoteHash0 = await siloNoteHash(address, value0);
      const noteNonce = await computeNoteHashNonce(firstNullifier, noteHashIndexInTx);
      uniqueNoteHash0 = await computeUniqueNoteHash(noteNonce, siloedNoteHash0);
    });

    beforeEach(async () => {
      trace = mock<PublicSideEffectTraceInterface>();
      mockNoteHashCount(trace, noteHashIndexInTx);

      const contractDataSource = new SimpleContractDataSource();
      const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
      treesDB = new PublicTreesDB(merkleTrees);
      contractsDB = new PublicContractsDB(contractDataSource);

      persistableState = initPersistableStateManager({
        treesDB,
        contractsDB,
        trace,
        doMerkleOperations: true,
        firstNullifier,
      });
    });

    const createContext = (calldata: Fr[] = []) => {
      return initContext({
        persistableState,
        env: initExecutionEnvironment({ address, sender, calldata }),
      });
    };

    describe('Note hashes', () => {
      it('Should append new note hash correctly', async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('new_note_hash');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([]);

        expect(trace.traceNewNoteHash).toHaveBeenCalledTimes(1);
        expect(trace.traceNewNoteHash).toHaveBeenCalledWith(uniqueNoteHash0);
      });
      it('Note hash check properly returns exists=false', async () => {
        const leafIndex = (await treesDB.getTreeSnapshots()).noteHashTree.nextAvailableLeafIndex;

        const calldata = [uniqueNoteHash0, new Fr(leafIndex)];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('note_hash_exists');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=*/ Fr.ZERO]);
      });
      it('Note hash check properly returns exists=true', async () => {
        const leafIndex = (await treesDB.getTreeSnapshots()).noteHashTree.nextAvailableLeafIndex;
        await treesDB.writeNoteHash(uniqueNoteHash0);

        const calldata = [uniqueNoteHash0, new Fr(leafIndex)];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('note_hash_exists');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=*/ Fr.ONE]);
      });
    });
    describe('Nullifiers', () => {
      it('Should append a new nullifier correctly', async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('new_nullifier');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([]);

        expect(trace.traceNewNullifier).toHaveBeenCalledTimes(1);
        expect(trace.traceNewNullifier).toHaveBeenCalledWith(siloedNullifier0);
      });
      it('Nullifier check properly returns exists=false', async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('nullifier_exists');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=*/ Fr.ZERO]);
      });
      it('Nullifier check properly returns exists=true', async () => {
        const calldata = [value0];
        await treesDB.writeNullifier(siloedNullifier0);
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('nullifier_exists');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=*/ Fr.ONE]);
      });
    });
    describe('Public storage accesses', () => {
      it('Should set value in storage (single)', async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);

        expect(await context.persistableState.readStorage(address, slot0)).toEqual(value0);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot0, value0, false);
      });

      it('Should read value in storage (single) - never written', async () => {
        const context = createContext();
        const bytecode = getAvmTestContractBytecode('read_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([Fr.zero()]);
      });

      it('Should read value in storage (single) - written before, leaf exists', async () => {
        const context = createContext();
        await treesDB.storageWrite(context.environment.address, slot0, value0);

        const bytecode = getAvmTestContractBytecode('read_storage_single');

        const results = await new AvmSimulator(context).executeBytecode(bytecode);
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);
      });

      it('Should set and read value in storage (single)', async () => {
        const calldata = [value0];
        const context = createContext(calldata);
        const bytecode = getAvmTestContractBytecode('set_read_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value0]);

        expect(trace.tracePublicStorageWrite).toHaveBeenCalledTimes(1);
        expect(trace.tracePublicStorageWrite).toHaveBeenCalledWith(address, slot0, value0, false);
      });
    });
  });

  it('should be able to execute contracts that only have private functions', async () => {
    const context = initContext({ env: initExecutionEnvironment({ calldata: [] }) });

    // NoteGetter contract is a private only contract (no public functions)
    const counterDispatch = getContractFunctionArtifact(
      'public_dispatch',
      NoteGetterContract.artifact,
    ) as FunctionArtifact;
    assert(!!counterDispatch?.bytecode);
    const results = await new AvmSimulator(context).executeBytecode(counterDispatch.bytecode);

    expect(results.reverted).toBe(true);
    expect(results.revertReason).toBeDefined();
    expect(
      resolveContractAssertionMessage(
        'public_dispatch',
        results.revertReason!,
        results.output,
        NoteGetterContract.artifact,
      ),
    ).toMatch('No public functions');
  });
});

function sha256FromMemoryBytes(bytes: Uint8[]): Promise<Fr[]> {
  return Promise.resolve([...sha256(Buffer.concat(bytes.map(b => b.toBuffer())))].map(b => new Fr(b)));
}

function keccak256FromMemoryBytes(bytes: Uint8[]): Promise<Fr[]> {
  return Promise.resolve([...keccak256(Buffer.concat(bytes.map(b => b.toBuffer())))].map(b => new Fr(b)));
}

function keccakF1600FromMemoryUint64s(mem: Uint64[]): Promise<Fr[]> {
  return Promise.resolve([...keccakf1600(mem.map(u => u.toBigInt()))].map(b => new Fr(b)));
}

async function poseidon2FromMemoryFields(fields: Fieldable[]): Promise<Fr[]> {
  return [await poseidon2Hash(fields)];
}

async function pedersenFromMemoryFields(fields: Fieldable[]): Promise<Fr[]> {
  return [await pedersenHash(fields)];
}

async function indexedPedersenFromMemoryFields(fields: Fieldable[]): Promise<Fr[]> {
  return [await pedersenHash(fields, /*index=*/ 20)];
}

function resolveAvmTestContractAssertionMessage(
  functionName: string,
  revertReason: AvmRevertReason,
  output: Fr[],
): string | undefined {
  return resolveContractAssertionMessage(functionName, revertReason, output, AvmTestContract.artifactForPublic);
}

function getAvmTestContractBytecode(functionName: string): Buffer {
  const artifact = getAvmTestContractArtifact(functionName);
  return artifact.bytecode;
}

function getAvmGadgetsTestContractArtifact(functionName: string): FunctionArtifact {
  const artifact = AvmGadgetsTestContract.artifactForPublic.functions.find(f => f.name === functionName)!;
  assert(
    !!artifact?.bytecode,
    `No bytecode found for function ${functionName}. Try re-running bootstrap.sh on the repository root.`,
  );
  return artifact;
}

function getAvmTestContractArtifact(functionName: string): FunctionArtifact {
  const artifact = getContractFunctionArtifact(functionName, AvmTestContract.artifactForPublic) as FunctionArtifact;
  assert(
    !!artifact?.bytecode,
    `No bytecode found for function ${functionName}. Try re-running bootstrap.sh on the repository root.`,
  );
  return artifact;
}
