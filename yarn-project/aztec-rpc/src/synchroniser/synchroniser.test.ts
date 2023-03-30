import { AztecNode } from '@aztec/aztec-node';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { Point } from '@aztec/foundation';
import { L2Block, UnverifiedData } from '@aztec/l2-block';
import { randomBytes } from 'crypto';
import { TxAuxData } from '../aztec_rpc_server/tx_aux_data/tx_aux_data.js';
import { Database } from '../database/database.js';
import { MemoryDB } from '../database/memory_db.js';
import { Synchroniser } from './synchroniser.js';
import { mock } from 'jest-mock-extended';

describe('Synchroniser', () => {
  let grumpkin: Grumpkin;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let database: Database;
  let synchroniser: Synchroniser;
  const ownerPrivKey = randomBytes(32);
  let ownerPubKey: Point;

  beforeAll(async () => {
    const wasm = await BarretenbergWasm.new();
    grumpkin = new Grumpkin(wasm);
    const ownerPubKey = Point.fromBuffer(grumpkin.mul(Grumpkin.generator, ownerPrivKey));

    // create array of 10 random blocks and 10 random unverified data
    const mockedBlocks = Array(10)
      .fill(0)
      .map((_, i) => L2Block.random(i));
    const mockedUnverifiedData = Array(10)
      .fill(0)
      .map(() => createRandomUnverifiedData(ownerPubKey, grumpkin));

    aztecNode = mock<AztecNode>();
    aztecNode.getBlocks.mockResolvedValueOnce(mockedBlocks);
    aztecNode.getUnverifiedData.mockResolvedValueOnce(mockedUnverifiedData);

    database = new MemoryDB();
    synchroniser = new Synchroniser(aztecNode, database);
    await synchroniser.addAccount(ownerPrivKey);
  });

  it('Synchroniser synchronises', async () => {
    synchroniser.start();
    await synchroniser.stop();
  });
});

function createRandomUnverifiedData(ownerPubKey: Point, grumpkin: Grumpkin): UnverifiedData {
  // pick random number between 1 and 10
  const numTxAuxData = Math.floor(Math.random() * 10) + 1;
  const ephPrivKey = randomBytes(32);
  const encryptedMockedTxAuxData = Array(numTxAuxData)
    .fill(0)
    .map(() => TxAuxData.random().toEncryptedBuffer(ownerPubKey, ephPrivKey, grumpkin));
  return new UnverifiedData(encryptedMockedTxAuxData);
}
