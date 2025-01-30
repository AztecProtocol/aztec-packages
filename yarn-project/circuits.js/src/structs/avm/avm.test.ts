import { AztecAddress, Fr, Point, PublicKeys } from '@aztec/circuits.js';
import { randomInt } from '@aztec/foundation/crypto';
import { readTestData, writeTestData } from '@aztec/foundation/testing/files';

import { makeAvmCircuitInputs } from '../../tests/factories.js';
import { AvmCircuitInputs, serializeWithMessagePack } from './avm.js';

describe('Avm circuit inputs', () => {
  it(`serializes to buffer and deserializes it back`, async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(randomInt(2000));
    const buffer = avmCircuitInputs.toBuffer();
    const res = AvmCircuitInputs.fromBuffer(buffer);
    expect(res).toEqual(avmCircuitInputs);
  });

  it('serialization sample for avm2', () => {
    const hints = {
      contractInstances: [
        {
          address: AztecAddress.fromBigInt(0x123456n),
          exists: true,
          salt: new Fr(0xdeadbeefn),
          deployer: AztecAddress.fromBigInt(0x000010n),
          contractClassId: new Fr(0x41181337n),
          initializationHash: new Fr(0x111111n),
          publicKeys: new PublicKeys(
            new Point(
              new Fr(0x16421839f863564fbe9035338aa8ef7bda077d04b178b1353e781cac7e83d155n),
              new Fr(0x2b6a73d9c017111f8223c81980e9ad167e1dec57d3f2fa649b11355b70b5f086n),
              false,
            ),
            new Point(
              new Fr(0x047d001b3998ca8ae785c6a06870d4b56335f510743f3e68fda159fe60f22582n),
              new Fr(0x1500cab14a6ea87cb26389431b0739bcf4b159d0e25b2c3a1cab94944254dcc4n),
              false,
            ),
            new Point(
              new Fr(0x03e11607d5adc8ce958646d7ef7cdcd8f4f48e0af20eca0ab4b07e8d1fc23deen),
              new Fr(0x1c89d3deed018ba1dbc81b9dfe265b367dbcf383f7e4374ba5c749028ba97158n),
              false,
            ),
            new Point(
              new Fr(0x268630a713908316c9af34f1d0f7f6e9dd80311b4973e2025bd86669a9955b23n),
              new Fr(0x227bca4c20b3000895ddb7f69d0cb375247d6ef49beffc54a8d264731d52fd24n),
              false,
            ),
          ),
          // TODO: membershipHint
        },
        {
          address: AztecAddress.fromBigInt(0x654321n),
          exists: false,
          salt: new Fr(0xdead0000n),
          deployer: AztecAddress.fromBigInt(0x000020n),
          contractClassId: new Fr(0x51181337n),
          initializationHash: new Fr(0x222222n),
          publicKeys: new PublicKeys(
            new Point(
              new Fr(0x16421839f863564fbe9035338aa8ef7bda077d04b178b1353e781cac7e83d155n),
              new Fr(0x2b6a73d9c017111f8223c81980e9ad167e1dec57d3f2fa649b11355b70b5f086n),
              false,
            ),
            new Point(
              new Fr(0x047d001b3998ca8ae785c6a06870d4b56335f510743f3e68fda159fe60f22582n),
              new Fr(0x1500cab14a6ea87cb26389431b0739bcf4b159d0e25b2c3a1cab94944254dcc4n),
              false,
            ),
            new Point(
              new Fr(0x03e11607d5adc8ce958646d7ef7cdcd8f4f48e0af20eca0ab4b07e8d1fc23deen),
              new Fr(0x1c89d3deed018ba1dbc81b9dfe265b367dbcf383f7e4374ba5c749028ba97158n),
              false,
            ),
            new Point(
              new Fr(0x268630a713908316c9af34f1d0f7f6e9dd80311b4973e2025bd86669a9955b23n),
              new Fr(0x227bca4c20b3000895ddb7f69d0cb375247d6ef49beffc54a8d264731d52fd24n),
              false,
            ),
          ),
          // TODO: membershipHint
        },
      ],
      contractClasses: [
        {
          artifactHash: new Fr(0xdeadbeefn),
          privateFunctionsRoot: new Fr(0x111111n),
          publicBytecodeCommitment: new Fr(0x222222n),
          packedBytecode: Buffer.from('firstbuffer'),
        },
        {
          artifactHash: new Fr(0xdead0000n),
          privateFunctionsRoot: new Fr(0x222222n),
          publicBytecodeCommitment: new Fr(0x333333n),
          packedBytecode: Buffer.from('secondbuffer'),
        },
      ],
      initialTreeRoots: {
        publicDataTree: new Fr(1),
        nullifierTree: new Fr(2),
        noteHashTree: new Fr(3),
        l1ToL2MessageTree: new Fr(4),
      },
    };

    const enqueuedCalls = [
      {
        contractAddress: AztecAddress.fromBigInt(0x123456n),
        sender: AztecAddress.fromBigInt(0x000010n),
        args: [new Fr(0x111111n), new Fr(0x222222n), new Fr(0x333333n)],
        isStatic: false,
      },
      {
        contractAddress: AztecAddress.fromBigInt(0x654321n),
        sender: AztecAddress.fromBigInt(0x000020n),
        args: [new Fr(0x222222n), new Fr(0x333333n), new Fr(0x444444n)],
        isStatic: true,
      },
    ];

    // Placeholder for now.
    const publicInputs = { dummy: [] };

    const inputs = {
      hints: hints,
      enqueuedCalls: enqueuedCalls,
      publicInputs: publicInputs,
    };

    // FIXME: this should use inputs.serializeForAvm2(), but I don't want to construct
    // an AvmCircuitInputs here, since that the "old" structure.
    const buffer = serializeWithMessagePack(inputs);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/common/avm_inputs.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    expect(buffer).toEqual(expected);
  });
});
