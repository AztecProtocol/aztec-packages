import { BlobDeserializationError } from '@aztec/blob-lib';
import { encodeTxStartMarker } from '@aztec/blob-lib/encoding';
import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { AztecAddress } from '../aztec-address/index.js';
import { ContractClassLog } from '../logs/contract_class_log.js';
import { PrivateLog } from '../logs/private_log.js';
import { PublicLog } from '../logs/public_log.js';
import { TxEffect } from './tx_effect.js';
import { TxHash } from './tx_hash.js';

const CONTRACT_CLASS_LOG_ADDRESS = 77n;
const PUBLIC_LOG_ADDRESS = 200n;

/**
 * A tx effect with a couple of items in every field, mirrored field for field by `small_fixture` in
 * `noir-projects/fnd/noir-protocol-circuits/crates/types/src/blob_data/tx_effect.nr`.
 */
function smallFixture(): TxEffect {
  return new TxEffect(
    RevertCode.REVERTED,
    TxHash.fromBigInt(0x1234n),
    new Fr(42),
    [new Fr(11), new Fr(12)],
    [new Fr(21)],
    [new Fr(31)],
    [new PublicDataWrite(new Fr(41), new Fr(42))],
    [PrivateLog.fromBlobFields(3, [new Fr(101), new Fr(102), new Fr(103)])],
    [new PublicLog(AztecAddress.fromBigIntUnsafe(PUBLIC_LOG_ADDRESS), [new Fr(201), new Fr(202)])],
    [ContractClassLog.fromBlobFields(2, [new Fr(CONTRACT_CLASS_LOG_ADDRESS), new Fr(301), new Fr(302)])],
  );
}

const fieldHash = (blobFields: Fr[]) => poseidon2HashWithSeparator(blobFields, DomainSeparator.TX_EFFECT_FIELD_HASH);

describe('TxEffect', () => {
  it('converts to and from buffer', async () => {
    const txEffect = await TxEffect.random();
    const buf = txEffect.toBuffer();
    expect(TxEffect.fromBuffer(buf)).toEqual(txEffect);
  });

  it('convert to and from json', async () => {
    const txEffect = await TxEffect.random();
    const parsed = TxEffect.schema.parse(JSON.parse(jsonStringify(txEffect)));
    expect(parsed).toEqual(txEffect);
  });

  it('converts to and from blob data', async () => {
    const txEffect = await TxEffect.random();
    const data = txEffect.toTxBlobData();
    expect(TxEffect.fromTxBlobData(data)).toEqual(txEffect);
  });

  it('converts to and from blob fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('converts empty to and from blob fields', () => {
    const txEffect = TxEffect.empty();
    const fields = txEffect.toBlobFields();
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('fails with invalid blob fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => TxEffect.fromBlobFields(fields)).toThrow(BlobDeserializationError);
  });

  it('fails with too few remaining blob fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    fields.pop();
    expect(() => TxEffect.fromBlobFields(fields)).toThrow(BlobDeserializationError);
  });

  it('ignores extra blob fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    fields.push(new Fr(7));
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('rejects more contract class logs than the protocol maximum', () => {
    const txEffect = smallFixture();
    const extraLog = ContractClassLog.fromBlobFields(2, [new Fr(CONTRACT_CLASS_LOG_ADDRESS), new Fr(303), new Fr(304)]);
    expect(
      () =>
        new TxEffect(
          txEffect.revertCode,
          txEffect.txHash,
          txEffect.transactionFee,
          txEffect.noteHashes,
          txEffect.nullifiers,
          txEffect.l2ToL1Msgs,
          txEffect.publicDataWrites,
          txEffect.privateLogs,
          txEffect.publicLogs,
          [...txEffect.contractClassLogs, extraLog],
        ),
    ).toThrow(/Too many contract class logs/);
  });

  describe('effect hash', () => {
    it('hashes each field over its slice of the blob encoding', async () => {
      const txEffect = smallFixture();

      const expectedTxEffectHash = await poseidon2HashWithSeparator(
        [
          encodeTxStartMarker(txEffect.getTxStartMarker()),
          new Fr(42), // transactionFee
          await fieldHash([new Fr(11), new Fr(12)]),
          await fieldHash([new Fr(21)]),
          await fieldHash([new Fr(31)]),
          await fieldHash([new Fr(41), new Fr(42)]),
          await fieldHash([new Fr(3), new Fr(101), new Fr(102), new Fr(103)]),
          await fieldHash([new Fr(2), new Fr(PUBLIC_LOG_ADDRESS), new Fr(201), new Fr(202)]),
          await fieldHash([new Fr(CONTRACT_CLASS_LOG_ADDRESS), new Fr(301), new Fr(302)]),
        ],
        DomainSeparator.TX_EFFECT_HASH,
      );

      expect(await txEffect.computeTxEffectHash()).toEqual(expectedTxEffectHash);
    });

    it('hashes empty fields to zero', async () => {
      const txEffect = TxEffect.empty();

      const expectedTxEffectHash = await poseidon2HashWithSeparator(
        [encodeTxStartMarker(txEffect.getTxStartMarker()), Fr.ZERO, ...Array(7).fill(Fr.ZERO)],
        DomainSeparator.TX_EFFECT_HASH,
      );

      expect(await txEffect.computeTxEffectHash()).toEqual(expectedTxEffectHash);
    });

    it('binds the tx hash into the leaf', async () => {
      const txEffect = smallFixture();

      const expectedLeaf = await poseidon2HashWithSeparator(
        [txEffect.txHash.hash, await txEffect.computeTxEffectHash()],
        DomainSeparator.TX_EFFECT_LEAF,
      );

      expect(await txEffect.computeTxEffectLeaf()).toEqual(expectedLeaf);
    });

    it('computes the leaf of the fixture', async () => {
      const leaf = await smallFixture().computeTxEffectLeaf();
      expect(leaf.toString()).toMatchInlineSnapshot(
        `"0x23123931ffdee54cf34fbf657b7817ad5fcae54bce508a739a01977591b991cc"`,
      );

      // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
      updateInlineTestData(
        'noir-projects/fnd/noir-protocol-circuits/crates/types/src/blob_data/tx_effect.nr',
        'test_data_tx_effect_leaf',
        leaf.toString(),
      );
    });
  });
});
