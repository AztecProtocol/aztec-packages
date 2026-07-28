import { PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { LogHash, ScopedLogHash } from '../kernel/log_hash.js';
import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ContractClassLogFields } from '../logs/contract_class_log.js';
import { PrivateLog } from '../logs/private_log.js';
import { L2ToL1Message, ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { mockTx } from '../tests/mocks.js';
import { MAX_CONTRACT_CLASS_LOG_FIELDS_PER_TX, MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX, Tx, TxArray } from './tx.js';

describe('Tx', () => {
  it('convert to and from buffer', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });

  it('convert to and from separate tx and proof buffers', async () => {
    const tx = await mockTx();
    const restored = Tx.fromBuffers(tx.withoutProof().toBuffer(), tx.chonkProof.toBuffer());
    expect(restored).toEqual(tx);
    expect(restored.chonkProof.isEmpty()).toBe(false);
  });

  it('convert to and from json', async () => {
    const tx = await mockTx();
    const json = jsonStringify(tx);
    expect(await Tx.schema.parseAsync(JSON.parse(json))).toEqual(tx);
  });

  describe('schema array limits', () => {
    // Parses a tx from json after replacing one of its arrays with `count` copies of a valid entry. The
    // schema recomputes the tx hash and does not cross-check the arrays against the kernel outputs, so the
    // resulting tx is well-formed as far as parsing is concerned.
    const parseWithArray = async (field: 'publicFunctionCalldata' | 'contractClassLogFields', count: number) => {
      const json = JSON.parse(jsonStringify(await mockTx()));
      const entry =
        field === 'publicFunctionCalldata'
          ? json.publicFunctionCalldata[0]
          : JSON.parse(jsonStringify(ContractClassLogFields.random()));
      json[field] = times(count, () => entry);
      return await Tx.schema.parseAsync(json);
    };

    it('accepts one calldata entry per call a tx can enqueue', async () => {
      const tx = await parseWithArray('publicFunctionCalldata', MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX);
      expect(tx.publicFunctionCalldata).toHaveLength(MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX);
    });

    it('rejects more calldata entries than a tx can enqueue', async () => {
      await expect(parseWithArray('publicFunctionCalldata', MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX + 1)).rejects.toThrow(
        expect.objectContaining({ name: 'ZodError' }),
      );
    });

    it('accepts contract class logs from both accumulated data sets', async () => {
      const tx = await parseWithArray('contractClassLogFields', MAX_CONTRACT_CLASS_LOG_FIELDS_PER_TX);
      expect(tx.contractClassLogFields).toHaveLength(MAX_CONTRACT_CLASS_LOG_FIELDS_PER_TX);
    });

    it('rejects more contract class logs than a tx can accumulate', async () => {
      await expect(parseWithArray('contractClassLogFields', MAX_CONTRACT_CLASS_LOG_FIELDS_PER_TX + 1)).rejects.toThrow(
        expect.objectContaining({ name: 'ZodError' }),
      );
    });
  });

  describe('getPrivateTxEffectsSizeInFields', () => {
    function makePrivateOnlyTx() {
      const data = PrivateKernelTailCircuitPublicInputs.emptyWithNullifier();
      return Tx.from({
        txHash: Tx.random().txHash,
        data,
        chonkProof: Tx.random().chonkProof,
        contractClassLogFields: [],
        publicFunctionCalldata: [],
      });
    }

    const someAddress = AztecAddress.fromFieldUnsafe(new Fr(27));

    it('returns overhead only for tx with just a nullifier', () => {
      const tx = makePrivateOnlyTx();
      // 3 fields overhead + 1 nullifier (from emptyWithNullifier)
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 1);
    });

    it('counts note hashes', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;
      end.noteHashes[0] = Fr.random();
      end.noteHashes[1] = Fr.random();
      // 3 overhead + 1 nullifier + 2 note hashes
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 1 + 2);
    });

    it('counts nullifiers', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;
      end.nullifiers[1] = Fr.random();
      end.nullifiers[2] = Fr.random();
      // 3 overhead + 3 nullifiers (1 from emptyWithNullifier + 2 new)
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 3);
    });

    it('counts L2 to L1 messages', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;
      end.l2ToL1Msgs[0] = new ScopedL2ToL1Message(new L2ToL1Message(EthAddress.random(), Fr.random()), someAddress);
      // 3 overhead + 1 nullifier + 1 L2-to-L1 message
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 1 + 1);
    });

    it('counts private logs with length field', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;
      const emittedLength = 5;
      end.privateLogs[0] = new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.random), emittedLength);
      // 3 overhead + 1 nullifier + (5 content + 1 length field)
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 1 + 6);
    });

    it('counts contract class logs with contract address field', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;
      const logLength = 10;
      end.contractClassLogsHashes[0] = new ScopedLogHash(new LogHash(Fr.random(), logLength), someAddress);
      // 3 overhead + 1 nullifier + (10 content + 1 contract address)
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(3 + 1 + 11);
    });

    it('counts all side effects together', () => {
      const tx = makePrivateOnlyTx();
      const end = tx.data.forRollup!.end;

      // 2 additional nullifiers (1 already from emptyWithNullifier)
      end.nullifiers[1] = Fr.random();
      end.nullifiers[2] = Fr.random();

      // 3 note hashes
      end.noteHashes[0] = Fr.random();
      end.noteHashes[1] = Fr.random();
      end.noteHashes[2] = Fr.random();

      // 1 L2-to-L1 message
      end.l2ToL1Msgs[0] = new ScopedL2ToL1Message(new L2ToL1Message(EthAddress.random(), Fr.random()), someAddress);

      // 2 private logs with different lengths
      end.privateLogs[0] = new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.random), 4);
      end.privateLogs[1] = new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.random), 7);

      // 1 contract class log
      end.contractClassLogsHashes[0] = new ScopedLogHash(new LogHash(Fr.random(), 12), someAddress);

      const expected =
        3 + // overhead
        3 + // note hashes
        3 + // nullifiers
        1 + // L2-to-L1 messages
        (4 + 1) + // first private log (content + length)
        (7 + 1) + // second private log (content + length)
        (12 + 1); // contract class log (content + contract address)
      expect(tx.getPrivateTxEffectsSizeInFields()).toBe(expected);
    });
  });
});

describe('TxArray', () => {
  it('converts to and from buffer', async () => {
    const tx1 = await mockTx();
    const tx2 = await mockTx();
    const txArray = new TxArray(tx1, tx2);
    expect(txArray.length).toBe(2);
    const buf = txArray.toBuffer();
    const deserializedTxArray = TxArray.fromBuffer(buf);
    expect(deserializedTxArray).toEqual(txArray);
    expect(deserializedTxArray).not.toBe(txArray);
  });

  it('converts empty TxArray to and from buffer', () => {
    const txArray = new TxArray();
    expect(txArray.length).toBe(0);
    const buf = txArray.toBuffer();
    const deserializedTxArray = TxArray.fromBuffer(buf);
    expect(deserializedTxArray).toEqual(txArray);
    expect(deserializedTxArray).not.toBe(txArray);
  });

  it('throws when deserializing invalid buffer', () => {
    const invalidBuffer = randomBytes(10);
    expect(() => TxArray.fromBuffer(invalidBuffer)).toThrow('Failed to deserialize TxArray from buffer');
  });

  it('throws when deserializing an empty buffer', () => {
    const invalidBuffer = Buffer.alloc(0);
    expect(() => TxArray.fromBuffer(invalidBuffer)).toThrow('Failed to deserialize TxArray from buffer');
  });
});
