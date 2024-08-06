import { AztecAddress } from '@aztec/foundation/aztec-address';
import { randomInt } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { L2_TO_L1_MESSAGE_LENGTH } from '../constants.gen.js';
import { makeL2ToL1Message } from '../tests/factories.js';
import { L2ToL1Message, ScopedL2ToL1Message } from './l2_to_l1_message.js';

describe('L2ToL1Message', () => {
  let message: L2ToL1Message;

  beforeAll(() => {
    message = makeL2ToL1Message(randomInt(1000));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = message.toBuffer();
    const res = L2ToL1Message.fromBuffer(buffer);
    expect(res).toEqual(message);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = message.toFields();
    const res = L2ToL1Message.fromFields(fieldArray);
    expect(res).toEqual(message);
  });

  it('number of fields matches constant', () => {
    const fields = message.toFields();
    expect(fields.length).toBe(L2_TO_L1_MESSAGE_LENGTH);
  });

  it('siloing matches Noir', () => {
    const version = new Fr(4);
    const chainId = new Fr(5);

    const nonEmpty = new ScopedL2ToL1Message(
      new L2ToL1Message(EthAddress.fromField(new Fr(1)), new Fr(2), 0),
      AztecAddress.fromField(new Fr(3)),
    );

    const nonEmptyHash = new Fr(nonEmpty.silo(version, chainId));

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
