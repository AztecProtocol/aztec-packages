import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import { makeAztecAddress } from '../tests/factories.js';
import {
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
      'hash_from_typescript',
      nonEmptyHash.toString(),
    );
  });
});
