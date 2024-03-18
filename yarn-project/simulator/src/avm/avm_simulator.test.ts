import { UnencryptedL2Log } from '@aztec/circuit-types';
import { EventSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { keccak, pedersenHash, poseidonHash, sha256 } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';
import { strict as assert } from 'assert';

import { TypeTag } from './avm_memory_types.js';
import { AvmSimulator } from './avm_simulator.js';
import {
  initContext,
  initExecutionEnvironment,
  initGlobalVariables,
  initL1ToL2MessageOracleInput,
} from './fixtures/index.js';
import { Add, CalldataCopy, Return } from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';

describe('AVM simulator', () => {
  it('Should execute bytecode that performs basic addition', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];

    // Construct bytecode
    const bytecode = encodeToBytecode([
      new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ 0, /*copySize=*/ 2, /*dstOffset=*/ 0),
      new Add(/*indirect=*/ 0, TypeTag.FIELD, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2),
      new Return(/*indirect=*/ 0, /*returnOffset=*/ 2, /*copySize=*/ 1),
    ]);

    const context = initContext({ env: initExecutionEnvironment({ calldata }) });
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    expect(results.output).toEqual([new Fr(3)]);
  });

  describe('Transpiled Noir contracts', () => {
    it('Should execute contract function that performs addition', async () => {
      const calldata: Fr[] = [new Fr(1), new Fr(2)];
      const context = initContext({ env: initExecutionEnvironment({ calldata }) });

      const bytecode = getAvmTestContractBytecode('add_args_return');
      const results = await new AvmSimulator(context).executeBytecode(bytecode);

      expect(results.reverted).toBe(false);
      expect(results.output).toEqual([new Fr(3)]);
    });

    it('Should execute contract function that performs U128 addition', async () => {
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

    describe.each([
      ['set_opcode_u8', 8n],
      ['set_opcode_u32', 1n << 30n],
      ['set_opcode_u64', 1n << 60n],
      ['set_opcode_small_field', 0x001234567890abcdef1234567890abcdefn],
      ['set_opcode_big_field', 0x991234567890abcdef1234567890abcdefn],
    ])('Should execute contract SET functions', (name: string, res: bigint) => {
      it(`Should execute contract function '${name}'`, async () => {
        const context = initContext();
        const bytecode = getAvmTestContractBytecode(name);
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([new Fr(res)]);
      });
    });

    describe.each([
      ['sha256_hash', sha256],
      ['keccak_hash', keccak],
    ])('Hashes with 2 fields returned in noir contracts', (name: string, hashFunction: (data: Buffer) => Buffer) => {
      it(`Should execute contract function that performs ${name} hash`, async () => {
        const calldata = [new Fr(1), new Fr(2), new Fr(3)];
        const hash = hashFunction(Buffer.concat(calldata.map(f => f.toBuffer())));

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode(name);
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([new Fr(hash.subarray(0, 16)), new Fr(hash.subarray(16, 32))]);
      });
    });

    describe.each([
      ['poseidon_hash', poseidonHash],
      ['pedersen_hash', pedersenHash],
    ])('Hashes with field returned in noir contracts', (name: string, hashFunction: (data: Buffer[]) => Fr) => {
      it(`Should execute contract function that performs ${name} hash`, async () => {
        const calldata = [new Fr(1), new Fr(2), new Fr(3)];
        const hash = hashFunction(calldata.map(f => f.toBuffer()));

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode(name);
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([new Fr(hash)]);
      });
    });

    describe('Test env getters from noir contract', () => {
      const testEnvGetter = async (valueName: string, value: any, functionName: string, globalVar: boolean = false) => {
        // Execute
        let overrides = {};
        if (globalVar === true) {
          const globals = initGlobalVariables({ [valueName]: value });
          overrides = { globals };
        } else {
          overrides = { [valueName]: value };
        }
        const context = initContext({ env: initExecutionEnvironment(overrides) });
        const bytecode = getAvmTestContractBytecode(functionName);
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        const returnData = results.output;
        expect(returnData).toEqual([value.toField()]);
      };

      it('address', async () => {
        const address = AztecAddress.fromField(new Fr(1));
        await testEnvGetter('address', address, 'get_address');
      });

      it('storageAddress', async () => {
        const storageAddress = AztecAddress.fromField(new Fr(1));
        await testEnvGetter('storageAddress', storageAddress, 'get_storage_address');
      });

      it('sender', async () => {
        const sender = AztecAddress.fromField(new Fr(1));
        await testEnvGetter('sender', sender, 'get_sender');
      });

      it('origin', async () => {
        const origin = AztecAddress.fromField(new Fr(1));
        await testEnvGetter('origin', origin, 'get_origin');
      });

      it('portal', async () => {
        const portal = EthAddress.fromField(new Fr(1));
        await testEnvGetter('portal', portal, 'get_portal');
      });

      it('getFeePerL1Gas', async () => {
        const fee = new Fr(1);
        await testEnvGetter('feePerL1Gas', fee, 'get_fee_per_l1_gas');
      });

      it('getFeePerL2Gas', async () => {
        const fee = new Fr(1);
        await testEnvGetter('feePerL2Gas', fee, 'get_fee_per_l2_gas');
      });

      it('getFeePerDaGas', async () => {
        const fee = new Fr(1);
        await testEnvGetter('feePerDaGas', fee, 'get_fee_per_da_gas');
      });

      it('chainId', async () => {
        const chainId = new Fr(1);
        await testEnvGetter('chainId', chainId, 'get_chain_id', /*globalVar=*/ true);
      });

      it('version', async () => {
        const version = new Fr(1);
        await testEnvGetter('version', version, 'get_version', /*globalVar=*/ true);
      });

      it('blockNumber', async () => {
        const blockNumber = new Fr(1);
        await testEnvGetter('blockNumber', blockNumber, 'get_block_number', /*globalVar=*/ true);
      });

      it('timestamp', async () => {
        const timestamp = new Fr(1);
        await testEnvGetter('timestamp', timestamp, 'get_timestamp', /*globalVar=*/ true);
      });
    });

    describe('Test tree access functions from noir contract (notes & nullifiers)', () => {
      it(`Should execute contract function that checks if a note hash exists (it does not)`, async () => {
        const noteHash = new Fr(42);
        const leafIndex = new Fr(7);
        const calldata = [noteHash, leafIndex];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('note_hash_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=false*/ new Fr(0)]);

        // Note hash existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.noteHashChecks).toEqual([expect.objectContaining({ noteHash, leafIndex, exists: false })]);
      });

      it(`Should execute contract function that checks if a note hash exists (it does)`, async () => {
        const noteHash = new Fr(42);
        const leafIndex = new Fr(7);
        const calldata = [noteHash, leafIndex];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        // note hash exists!
        jest
          .spyOn(context.persistableState.hostStorage.commitmentsDb, 'getCommitmentIndex')
          .mockReturnValue(Promise.resolve(BigInt(7)));
        const bytecode = getAvmTestContractBytecode('note_hash_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=true*/ new Fr(1)]);

        // Note hash existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.noteHashChecks).toEqual([expect.objectContaining({ noteHash, leafIndex, exists: true })]);
      });

      it(`Should execute contract function to emit unencrypted logs (should be traced)`, async () => {
        const context = initContext();
        const bytecode = getAvmTestContractBytecode('emit_unencrypted_log');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        const expectedFields = [new Fr(10), new Fr(20), new Fr(30)];
        const expectedString = 'Hello, world!'.split('').map(c => new Fr(c.charCodeAt(0)));
        const expectedCompressedString = Buffer.from(
          '\0A long time ago, in a galaxy fa' + '\0r far away...\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0',
        );
        expect(context.persistableState.flush().newLogs).toEqual([
          new UnencryptedL2Log(
            context.environment.address,
            new EventSelector(5),
            Buffer.concat(expectedFields.map(f => f.toBuffer())),
          ),
          new UnencryptedL2Log(
            context.environment.address,
            new EventSelector(8),
            Buffer.concat(expectedString.map(f => f.toBuffer())),
          ),
          new UnencryptedL2Log(context.environment.address, new EventSelector(10), expectedCompressedString),
        ]);
      });

      it(`Should execute contract function to emit note hash (should be traced)`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('new_note_hash');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        expect(context.persistableState.flush().newNoteHashes).toEqual([utxo]);
      });

      it(`Should execute contract function to emit nullifier (should be traced)`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('new_nullifier');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        expect(context.persistableState.flush().newNullifiers).toEqual([utxo]);
      });

      it(`Should execute contract function that checks if a nullifier exists (it does not)`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('nullifier_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=false*/ new Fr(0)]);

        // Nullifier existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.nullifierChecks.length).toEqual(1);
        expect(trace.nullifierChecks[0].exists).toEqual(false);
      });

      it(`Should execute contract function that checks if a nullifier exists (it does)`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        // nullifier exists!
        jest
          .spyOn(context.persistableState.hostStorage.commitmentsDb, 'getNullifierIndex')
          .mockReturnValue(Promise.resolve(BigInt(42)));
        const bytecode = getAvmTestContractBytecode('nullifier_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=true*/ new Fr(1)]);

        // Nullifier existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.nullifierChecks.length).toEqual(1);
        expect(trace.nullifierChecks[0].exists).toEqual(true);
      });

      it(`Should execute contract function that checks emits a nullifier and checks its existence`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('emit_nullifier_and_check');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        // Nullifier existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.newNullifiers).toEqual([utxo]);
        expect(trace.nullifierChecks.length).toEqual(1);
        expect(trace.nullifierChecks[0].exists).toEqual(true);
      });

      it(`Should execute contract function that emits same nullifier twice (should fail)`, async () => {
        const utxo = new Fr(42);
        const calldata = [utxo];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('nullifier_collision');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(true);
        // Only the first nullifier should be in the trace, second one failed to add
        expect(context.persistableState.flush().newNullifiers).toEqual([utxo]);
      });
    });

    describe('Test tree access functions from noir contract (l1ToL2 messages)', () => {
      it(`Should execute contract function that checks if a message exists (it does not)`, async () => {
        const msgHash = new Fr(42);
        const leafIndex = new Fr(24);
        const calldata = [msgHash, leafIndex];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        const bytecode = getAvmTestContractBytecode('l1_to_l2_msg_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=false*/ new Fr(0)]);
        // Message existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.l1ToL2MessageChecks.length).toEqual(1);
        expect(trace.l1ToL2MessageChecks[0].exists).toEqual(false);
      });

      it(`Should execute contract function that checks if a message exists (it does)`, async () => {
        const msgHash = new Fr(42);
        const leafIndex = new Fr(24);
        const calldata = [msgHash, leafIndex];

        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        jest
          .spyOn(context.persistableState.hostStorage.commitmentsDb, 'getL1ToL2MembershipWitness')
          .mockResolvedValue(initL1ToL2MessageOracleInput(leafIndex.toBigInt()));
        const bytecode = getAvmTestContractBytecode('l1_to_l2_msg_exists');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*exists=false*/ new Fr(1)]);
        // Message existence check should be in trace
        const trace = context.persistableState.flush();
        expect(trace.l1ToL2MessageChecks.length).toEqual(1);
        expect(trace.l1ToL2MessageChecks[0].exists).toEqual(true);
      });
    });

    describe('Test nested external calls from noir contract', () => {
      it(`Should execute contract function that makes a nested call`, async () => {
        const calldata: Fr[] = [new Fr(1), new Fr(2)];
        const callBytecode = getAvmTestContractBytecode('raw_nested_call_to_add');
        const addBytecode = getAvmTestContractBytecode('add_args_return');
        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(addBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([new Fr(3)]);
      });

      it(`Should execute contract function that makes a nested call through the old interface`, async () => {
        const calldata: Fr[] = [new Fr(1), new Fr(2)];
        const callBytecode = getAvmTestContractBytecode('nested_call_to_add');
        const addBytecode = getAvmTestContractBytecode('add_args_return');
        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(addBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([new Fr(3)]);
      });

      it(`Should execute contract function that makes a nested static call`, async () => {
        const calldata: Fr[] = [new Fr(1), new Fr(2)];
        const callBytecode = getAvmTestContractBytecode('raw_nested_static_call_to_add');
        const addBytecode = getAvmTestContractBytecode('add_args_return');
        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(addBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*result=*/ new Fr(3), /*success=*/ new Fr(1)]);
      });

      it(`Should execute contract function that makes a nested static call which modifies storage`, async () => {
        const callBytecode = getAvmTestContractBytecode('raw_nested_static_call_to_set_storage');
        const nestedBytecode = getAvmTestContractBytecode('set_storage_single');
        const context = initContext();
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(nestedBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false); // The outer call should not revert.
        expect(results.output).toEqual([new Fr(0)]); // The inner call should have reverted.
      });

      it(`Should execute contract function that makes a nested static call (old interface)`, async () => {
        const calldata: Fr[] = [new Fr(1), new Fr(2)];
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_add');
        const addBytecode = getAvmTestContractBytecode('add_args_return');
        const context = initContext({ env: initExecutionEnvironment({ calldata }) });
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(addBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([/*result=*/ new Fr(3)]);
      });

      it(`Should execute contract function that makes a nested static call which modifies storage (old interface)`, async () => {
        const callBytecode = getAvmTestContractBytecode('nested_static_call_to_set_storage');
        const nestedBytecode = getAvmTestContractBytecode('set_storage_single');
        const context = initContext();
        jest
          .spyOn(context.persistableState.hostStorage.contractsDb, 'getBytecode')
          .mockReturnValueOnce(Promise.resolve(nestedBytecode));

        const results = await new AvmSimulator(context).executeBytecode(callBytecode);

        expect(results.reverted).toBe(true); // The outer call should revert.
      });
    });

    describe('Storage accesses', () => {
      it('Should set value in storage (single)', async () => {
        const slot = 1n;
        const address = AztecAddress.fromField(new Fr(420));
        const value = new Fr(88);
        const calldata = [value];

        const context = initContext({
          env: initExecutionEnvironment({ calldata, address, storageAddress: address }),
        });
        const bytecode = getAvmTestContractBytecode('set_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        // World state
        const worldState = context.persistableState.flush();
        const storageSlot = worldState.currentStorageValue.get(address.toBigInt())!;
        const adminSlotValue = storageSlot.get(slot);
        expect(adminSlotValue).toEqual(value);

        // Tracing
        const storageTrace = worldState.storageWrites.get(address.toBigInt())!;
        const slotTrace = storageTrace.get(slot);
        expect(slotTrace).toEqual([value]);
      });

      it('Should read value in storage (single)', async () => {
        const slot = 1n;
        const value = new Fr(12345);
        const address = AztecAddress.fromField(new Fr(420));
        const storage = new Map([[slot, value]]);

        const context = initContext({
          env: initExecutionEnvironment({ storageAddress: address }),
        });
        jest
          .spyOn(context.persistableState.hostStorage.publicStateDb, 'storageRead')
          .mockImplementation((_address, slot) => Promise.resolve(storage.get(slot.toBigInt())!));
        const bytecode = getAvmTestContractBytecode('read_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        // Get contract function artifact
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value]);

        // Tracing
        const worldState = context.persistableState.flush();
        const storageTrace = worldState.storageReads.get(address.toBigInt())!;
        const slotTrace = storageTrace.get(slot);
        expect(slotTrace).toEqual([value]);
      });

      it('Should set and read a value from storage (single)', async () => {
        const slot = 1n;
        const value = new Fr(12345);
        const address = AztecAddress.fromField(new Fr(420));
        const calldata = [value];

        const context = initContext({
          env: initExecutionEnvironment({ calldata, address, storageAddress: address }),
        });
        const bytecode = getAvmTestContractBytecode('set_read_storage_single');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value]);

        // Test read trace
        const worldState = context.persistableState.flush();
        const storageReadTrace = worldState.storageReads.get(address.toBigInt())!;
        const slotReadTrace = storageReadTrace.get(slot);
        expect(slotReadTrace).toEqual([value]);

        // Test write trace
        const storageWriteTrace = worldState.storageWrites.get(address.toBigInt())!;
        const slotWriteTrace = storageWriteTrace.get(slot);
        expect(slotWriteTrace).toEqual([value]);
      });

      it('Should set a value in storage (list)', async () => {
        const slot = 2n;
        const sender = AztecAddress.fromField(new Fr(1));
        const address = AztecAddress.fromField(new Fr(420));
        const calldata = [new Fr(1), new Fr(2)];

        const context = initContext({
          env: initExecutionEnvironment({ sender, address, calldata, storageAddress: address }),
        });
        const bytecode = getAvmTestContractBytecode('set_storage_list');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);

        const worldState = context.persistableState.flush();
        const storageSlot = worldState.currentStorageValue.get(address.toBigInt())!;
        expect(storageSlot.get(slot)).toEqual(calldata[0]);
        expect(storageSlot.get(slot + 1n)).toEqual(calldata[1]);

        // Tracing
        const storageTrace = worldState.storageWrites.get(address.toBigInt())!;
        expect(storageTrace.get(slot)).toEqual([calldata[0]]);
        expect(storageTrace.get(slot + 1n)).toEqual([calldata[1]]);
      });

      it('Should read a value in storage (list)', async () => {
        const slot = 2n;
        const address = AztecAddress.fromField(new Fr(420));
        const values = [new Fr(1), new Fr(2)];
        const storage = new Map([
          [slot, values[0]],
          [slot + 1n, values[1]],
        ]);

        const context = initContext({
          env: initExecutionEnvironment({ address, storageAddress: address }),
        });
        jest
          .spyOn(context.persistableState.hostStorage.publicStateDb, 'storageRead')
          .mockImplementation((_address, slot) => Promise.resolve(storage.get(slot.toBigInt())!));
        const bytecode = getAvmTestContractBytecode('read_storage_list');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        expect(results.output).toEqual(values);

        // Tracing
        const worldState = context.persistableState.flush();
        const storageTrace = worldState.storageReads.get(address.toBigInt())!;
        expect(storageTrace.get(slot)).toEqual([values[0]]);
        expect(storageTrace.get(slot + 1n)).toEqual([values[1]]);
      });

      it('Should set a value in storage (map)', async () => {
        const address = AztecAddress.fromField(new Fr(420));
        const value = new Fr(12345);
        const calldata = [address.toField(), value];

        const context = initContext({
          env: initExecutionEnvironment({ address, calldata, storageAddress: address }),
        });
        const bytecode = getAvmTestContractBytecode('set_storage_map');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        // returns the storage slot for modified key
        const slotNumber = results.output[0].toBigInt();

        const worldState = context.persistableState.flush();
        const storageSlot = worldState.currentStorageValue.get(address.toBigInt())!;
        expect(storageSlot.get(slotNumber)).toEqual(value);

        // Tracing
        const storageTrace = worldState.storageWrites.get(address.toBigInt())!;
        expect(storageTrace.get(slotNumber)).toEqual([value]);
      });

      it('Should read-add-set a value in storage (map)', async () => {
        const address = AztecAddress.fromField(new Fr(420));
        const value = new Fr(12345);
        const calldata = [address.toField(), value];

        const context = initContext({
          env: initExecutionEnvironment({ address, calldata, storageAddress: address }),
        });
        const bytecode = getAvmTestContractBytecode('add_storage_map');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        expect(results.reverted).toBe(false);
        // returns the storage slot for modified key
        const slotNumber = results.output[0].toBigInt();

        const worldState = context.persistableState.flush();
        const storageSlot = worldState.currentStorageValue.get(address.toBigInt())!;
        expect(storageSlot.get(slotNumber)).toEqual(value);

        // Tracing
        const storageReadTrace = worldState.storageReads.get(address.toBigInt())!;
        expect(storageReadTrace.get(slotNumber)).toEqual([new Fr(0)]);
        const storageWriteTrace = worldState.storageWrites.get(address.toBigInt())!;
        expect(storageWriteTrace.get(slotNumber)).toEqual([value]);
      });

      it('Should read value in storage (map)', async () => {
        const value = new Fr(12345);
        const address = AztecAddress.fromField(new Fr(420));
        const calldata = [address.toField()];

        const context = initContext({
          env: initExecutionEnvironment({ calldata, address, storageAddress: address }),
        });
        jest
          .spyOn(context.persistableState.hostStorage.publicStateDb, 'storageRead')
          .mockReturnValue(Promise.resolve(value));
        const bytecode = getAvmTestContractBytecode('read_storage_map');
        const results = await new AvmSimulator(context).executeBytecode(bytecode);

        // Get contract function artifact
        expect(results.reverted).toBe(false);
        expect(results.output).toEqual([value]);

        // Tracing
        const worldState = context.persistableState.flush();
        const storageTrace = worldState.storageReads.get(address.toBigInt())!;
        expect([...storageTrace.values()]).toEqual([[value]]);
      });
    });
  });
});

function getAvmTestContractBytecode(functionName: string): Buffer {
  const artifact = AvmTestContractArtifact.functions.find(f => f.name === functionName)!;
  assert(
    !!artifact?.bytecode,
    `No bytecode found for function ${functionName}. Try re-running bootstrap.sh on the repository root.`,
  );
  return Buffer.from(artifact.bytecode, 'base64');
}
