import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import { L2ToL1Message, ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { makeAztecAddress } from '../tests/factories.js';
import {
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computePublicDataTreeValue,
  computeSecretHash,
  computeUniqueNoteHash,
  computeVarArgsHash,
  siloL2ToL1Message,
  siloNoteHash,
  siloNullifier,
} from './hash.js';

describe('hash', () => {
  setupCustomSnapshotSerializers(expect);

  it('computes note hash nonce', async () => {
    const nullifierZero = new Fr(123n);
    const noteHashIndex = 456;
    const res = await computeNoteHashNonce(nullifierZero, noteHashIndex);
    expect(res).toMatchSnapshot();
  });

  it('computes unique note hash', async () => {
    const noteNonce = new Fr(123n);
    const noteHash = new Fr(456);
    const res = await computeUniqueNoteHash(noteNonce, noteHash);
    expect(res).toMatchSnapshot();
  });

  it('computes siloed note hash', async () => {
    const contractAddress = new AztecAddress(new Fr(123n).toBuffer());
    const uniqueNoteHash = new Fr(456);
    const res = await siloNoteHash(contractAddress, uniqueNoteHash);
    expect(res).toMatchSnapshot();
  });

  it('computes siloed nullifier', async () => {
    const contractAddress = new AztecAddress(new Fr(123n).toBuffer());
    const innerNullifier = new Fr(456);
    const res = await siloNullifier(contractAddress, innerNullifier);
    expect(res).toMatchSnapshot();
  });

  it('computes public data tree value', () => {
    const value = new Fr(3n);
    const res = computePublicDataTreeValue(value);
    expect(res).toMatchSnapshot();
  });

  it('computes public data tree leaf slot', async () => {
    const contractAddress = makeAztecAddress();
    const value = new Fr(3n);
    const res = await computePublicDataTreeLeafSlot(contractAddress, value);
    expect(res).toMatchSnapshot();
  });

  it('hashes empty function args', async () => {
    const res = await computeVarArgsHash([]);
    expect(res).toMatchSnapshot();
  });

  it('hashes function args', async () => {
    const args = times(8, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res).toMatchSnapshot();
  });

  it('hashes many function args', async () => {
    const args = times(200, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res).toMatchSnapshot();
  });

  it('compute secret message hash', async () => {
    const value = new Fr(8n);
    const hash = await computeSecretHash(value);
    expect(hash).toMatchSnapshot();
  });

  it('Var args hash matches noir', async () => {
    const args = times(100, i => new Fr(i));
    const res = await computeVarArgsHash(args);
    expect(res).toMatchSnapshot();

    // Value used in "compute_var_args_hash" test in hash.nr
    // console.log("hash", hash);
  });

  it('L2ToL1Message siloing matches Noir', () => {
    const version = new Fr(4);
    const chainId = new Fr(5);

    const nonEmpty = new ScopedL2ToL1Message(
      new L2ToL1Message(EthAddress.fromField(new Fr(1)), new Fr(2)),
      AztecAddress.fromField(new Fr(3)),
    );

    const nonEmptyHash = new Fr(siloL2ToL1Message(nonEmpty, version, chainId));

    expect(nonEmptyHash.toString()).toMatchInlineSnapshot(
      `"0x00c6155d69febb9d5039b374dd4f77bf57b7c881709aa524a18acaa0bd57476a"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/hash.nr',
      'hash_from_typescript',
      nonEmptyHash.toString(),
    );
  });
});
