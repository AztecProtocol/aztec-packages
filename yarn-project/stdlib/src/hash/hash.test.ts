import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import {
  computeCalldataHash,
  computeL2ToL1MessageHash,
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computePublicDataTreeValue,
  computeSecretHash,
  computeUniqueNoteHash,
  computeVarArgsHash,
  siloNoteHash,
  siloNullifier,
} from './hash.js';

describe('hash', () => {
  it('computes note hash nonce', async () => {
    const nullifierZero = new Fr(123n);
    const noteHashIndex = 456;
    const res = await computeNoteHashNonce(nullifierZero, noteHashIndex);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x29ceb9ede6ce1c94c6ef90ee92d82048328ff9542fec22ee33b3795000ba6f7e"`,
    );
  });

  it('computes unique note hash', async () => {
    const noteNonce = new Fr(123n);
    const noteHash = new Fr(456);
    const res = await computeUniqueNoteHash(noteNonce, noteHash);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x2d05529612f55956384d8cd7cd0f3781ce4531b7c47261a27c1ddf547731e74c"`,
    );
  });

  it('computes siloed note hash', async () => {
    const contractAddress = new AztecAddress(new Fr(123n).toBuffer());
    const uniqueNoteHash = new Fr(456);
    const res = await siloNoteHash(contractAddress, uniqueNoteHash);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x23c41572a4ee6ae40225f937f8474149685691367ed8d89dcd92049787680968"`,
    );
  });

  it('computes siloed nullifier', async () => {
    const contractAddress = new AztecAddress(new Fr(123n).toBuffer());
    const innerNullifier = new Fr(456);
    const res = await siloNullifier(contractAddress, innerNullifier);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x169b50336c1f29afdb8a03d955a81e485f5ac7d5f0b8065673d1e407e5877813"`,
    );
  });

  it('computes public data tree value', () => {
    const value = new Fr(3n);
    const res = computePublicDataTreeValue(value);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x0000000000000000000000000000000000000000000000000000000000000003"`,
    );
  });

  it('computes public data tree leaf slot', async () => {
    const contractAddress = AztecAddress.fromField(new Fr(987));
    const storageSlot = new Fr(123);
    const res = await computePublicDataTreeLeafSlot(contractAddress, storageSlot);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x2683061b3777be03ecc034934748ab2d7930d784a2a5bf47b5a6706b01719193"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/data/hash.nr',
      'public_data_leaf_slot_from_ts',
      res.toString(),
    );
  });

  it('hashes empty function args', async () => {
    const res = await computeVarArgsHash([]);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x0000000000000000000000000000000000000000000000000000000000000000"`,
    );
  });

  it('hashes function args', async () => {
    const args = times(8, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x1546c9fd82f880f1a4b9d10033917ba587d2b86e2396eb82c5f3f384bdb09a9c"`,
    );
  });

  it('hashes many function args', async () => {
    const args = times(200, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x06e6b114591607b396a35aa84f90d6548fa76ce91a90aca3fe8efa5f1ff67d0f"`,
    );
  });

  it('compute secret message hash', async () => {
    const value = new Fr(8n);
    const hash = await computeSecretHash(value);
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x1848b066724ab0ffb50ecb0ee3398eb839f162823d262bad959721a9c13d1e96"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData('noir-projects/aztec-nr/aztec/src/hash.nr', 'secret_hash_from_ts', hash.toString());
  });

  it('Var args hash matches noir', async () => {
    const args = times(100, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x262e5e121a8efc0382566ab42f0ae2a78bd85db88484f83018fe07fc2552ba0c"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData('noir-projects/aztec-nr/aztec/src/hash.nr', 'var_args_hash_from_ts', res.toString());
  });

  it('calldata hash matches noir', async () => {
    const args = times(100, i => new Fr(i));
    const res = await computeCalldataHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x14a1539bdb1d26e03097cf4d40c87e02ca03f0bb50a3e617ace5a7bfd3943944"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData('noir-projects/aztec-nr/aztec/src/hash.nr', 'calldata_hash_from_ts', res.toString());
  });

  it('L2ToL1Message siloing matches Noir', () => {
    const nonEmptyHash = computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromField(new Fr(3)),
      l1Recipient: EthAddress.fromField(new Fr(1)),
      content: new Fr(2),
      rollupVersion: new Fr(4),
      chainId: new Fr(5),
    });

    expect(nonEmptyHash.toString()).toMatchInlineSnapshot(
      `"0x0081edf209e087ad31b3fd24263698723d57190bd1d6e9fe056fc0c0a68ee661"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/hash.nr',
      'l2_to_l1_message_hash_from_ts',
      nonEmptyHash.toString(),
    );
  });
});
