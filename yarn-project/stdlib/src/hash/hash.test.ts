import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import {
  computeCalldataHash,
  computeL2ToL1MessageHash,
  computeNoteHashNonce,
  computePrivateContentHash,
  computePublicDataTreeLeafSlot,
  computePublicDataTreeValue,
  computeSiloedPrivateLogFirstField,
  computeUniqueNoteHash,
  computeVarArgsHash,
  siloNoteHash,
  siloNullifier,
} from './hash.js';

describe('hash', () => {
  it('computes unique siloed note hash', async () => {
    const innerNoteHash = new Fr(1);
    const contractAddress = new AztecAddress(new Fr(2));
    const firstNullifier = new Fr(3);
    const noteIndexInTx = 4;

    const siloedNoteHash = await siloNoteHash(contractAddress, innerNoteHash);
    expect(siloedNoteHash.toString()).toMatchInlineSnapshot(
      '"0x1986a4bea3eddb1fff917d629a13e10f63f514f401bdd61838c6b475db949169"',
    );

    const noteNonce = await computeNoteHashNonce(firstNullifier, noteIndexInTx);
    expect(noteNonce.toString()).toMatchInlineSnapshot(
      '"0x28e7799791bf066a57bb51fdd0fbcaf3f0926414314c7db515ea343f44f5d58b"',
    );

    const uniqueSiloedNoteHash = await computeUniqueNoteHash(noteNonce, siloedNoteHash);
    expect(uniqueSiloedNoteHash.toString()).toMatchInlineSnapshot(
      '"0x29949aef207b715303b24639737c17fbfeb375c1d965ecfa85c7e4f0febb7d16"',
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'siloed_note_hash_from_ts',
      siloedNoteHash.toString(),
    );
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'note_hash_nonce_from_ts',
      noteNonce.toString(),
    );
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'unique_siloed_note_hash_from_ts',
      uniqueSiloedNoteHash.toString(),
    );
  });

  it('computes siloed nullifier', async () => {
    const contractAddress = new AztecAddress(new Fr(123));
    const innerNullifier = new Fr(456);
    const res = await siloNullifier(contractAddress, innerNullifier);
    expect(res.toString()).toMatchInlineSnapshot(
      '"0x169b50336c1f29afdb8a03d955a81e485f5ac7d5f0b8065673d1e407e5877813"',
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'siloed_nullifier_from_ts',
      res.toString(),
    );
  });

  it('computes siloed private log first field', async () => {
    const contractAddress = new AztecAddress(new Fr(123));
    const field = new Fr(456);
    const res = await computeSiloedPrivateLogFirstField(contractAddress, field);
    expect(res.toString()).toMatchInlineSnapshot(
      '"0x29480984f7b9257fded523d50addbcfc8d1d33adcf2db73ef3390a8fd5cdffaa"',
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'siloed_private_log_first_field_from_ts',
      res.toString(),
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
    const contractAddress = AztecAddress.fromFieldUnsafe(new Fr(987));
    const storageSlot = new Fr(123);
    const res = await computePublicDataTreeLeafSlot(contractAddress, storageSlot);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x2683061b3777be03ecc034934748ab2d7930d784a2a5bf47b5a6706b01719193"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/data/hash.nr',
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

  it('compute private content hash', async () => {
    const privateContent = [new Fr(8n)];
    const hash = await computePrivateContentHash(privateContent);
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x2c8f08f651c706fc41742a1bddf91e10c710c827266b71fbb50c7ee4f1db70d7"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/labs/aztec-nr/aztec/src/hash.nr',
      'private_content_hash_from_ts',
      hash.toString(),
    );
  });

  it('Var args hash matches noir', async () => {
    const args = times(100, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x262e5e121a8efc0382566ab42f0ae2a78bd85db88484f83018fe07fc2552ba0c"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData('noir-projects/labs/aztec-nr/aztec/src/hash.nr', 'var_args_hash_from_ts', res.toString());
  });

  it('calldata hash matches noir', async () => {
    const args = times(100, i => new Fr(i));
    const res = await computeCalldataHash(args);
    expect(res.toString()).toMatchInlineSnapshot(
      `"0x14a1539bdb1d26e03097cf4d40c87e02ca03f0bb50a3e617ace5a7bfd3943944"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData('noir-projects/labs/aztec-nr/aztec/src/hash.nr', 'calldata_hash_from_ts', res.toString());
  });

  it('empty L2ToL1Message siloing matches Noir', () => {
    const nonEmptyHash = computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromFieldUnsafe(new Fr(0)),
      l1Recipient: EthAddress.fromField(new Fr(0)),
      content: new Fr(0),
      rollupVersion: new Fr(0),
      chainId: new Fr(0),
    });

    expect(nonEmptyHash.toString()).toMatchInlineSnapshot(
      `"0x003b18c58c739716e76429634a61375c45b3b5cd470c22ab6d3e14cee23dd992"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'empty_l2_to_l1_msg_hash_from_ts',
      nonEmptyHash.toString(),
    );
  });

  it('L2ToL1Message siloing matches Noir', () => {
    const nonEmptyHash = computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromFieldUnsafe(new Fr(3)),
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
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr',
      'l2_to_l1_message_hash_from_ts',
      nonEmptyHash.toString(),
    );
  });
});
