import { CheatCodes, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { SparseTree, newTree } from '@aztec/merkle-tree';
import { SlowTreeContract } from '@aztec/noir-contracts/types';
import { Hasher } from '@aztec/types';

import { default as levelup } from 'levelup';
import { type MemDown, default as memdown } from 'memdown';

import { setup } from './fixtures/utils.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

describe('e2e_slow_tree', () => {
  let logger: DebugLogger;
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  let contract: SlowTreeContract;
  let cheatCodes: CheatCodes;

  beforeAll(async () => {
    ({ teardown, logger, wallet, cheatCodes } = await setup());
    contract = await SlowTreeContract.deploy(wallet).send().deployed();
  }, 100_000);

  afterAll(() => teardown());

  /**
   * Pedersen hasher for the slow tree to match noir hashing.
   */
  class PedersenHasher implements Hasher {
    private readonly circuitsWasm: CircuitsWasm;

    constructor(circuitsWasm: CircuitsWasm) {
      this.circuitsWasm = circuitsWasm;
    }
    compressInputs(_inputs: Buffer[]): Buffer {
      throw new Error('Method not implemented.');
    }
    hashToField(_data: Uint8Array): Buffer {
      throw new Error('Method not implemented.');
    }
    hashToTree(_leaves: Buffer[]): Promise<Buffer[]> {
      throw new Error('Method not implemented.');
    }

    public compress(lhs: Buffer, rhs: Buffer): Buffer {
      return pedersenPlookupCommitInputs(this.circuitsWasm, [lhs, rhs]);
    }
  }

  it('Messing around with noir slow tree', async () => {
    const circuitsWasm = await CircuitsWasm.get();
    const hasher = new PedersenHasher(circuitsWasm);

    const db = levelup(createMemDown());
    const depth = 4;
    const tree = await newTree(SparseTree, db, hasher, 'test', depth);
    const root = tree.getRoot(true);

    const getMembershipProof = async (index: bigint, includeUncommitted: boolean) => {
      return {
        index,
        value: Fr.fromBuffer((await tree.getLeafValue(index, includeUncommitted))!),
        // eslint-disable-next-line camelcase
        sibling_path: (await tree.getSiblingPath(index, includeUncommitted)).toFieldArray(),
      };
    };

    const getUpdateProof = async (index: bigint, newValue: bigint) => {
      const beforeProof = await getMembershipProof(index, false);
      const afterProof = await getMembershipProof(index, true);

      return {
        index,
        // eslint-disable-next-line camelcase
        new_value: newValue,
        // eslint-disable-next-line camelcase
        before: { value: beforeProof.value, sibling_path: beforeProof.sibling_path },
        // eslint-disable-next-line camelcase
        after: { value: afterProof.value, sibling_path: afterProof.sibling_path },
      };
    };

    const status = async () => {
      logger(`\tTime: ${await cheatCodes.eth.timestamp()}`);
      logger('\tRoot', await contract.methods.un_read_root(owner).view());
      logger('\tLeaf', await contract.methods.un_read_leaf_at(owner, 0n).view());
    };

    const owner = wallet.getCompleteAddress().address;
    await contract.methods.initialize(root).send().wait();

    logger('Initial state');
    await status();

    await contract.methods
      .read_at(await getMembershipProof(0n, true))
      .send()
      .wait();

    logger('Updating tree[0] to 1 from public');
    await contract.methods
      .update_at(await getUpdateProof(0n, 1n))
      .send()
      .wait();
    await tree.updateLeaf(new Fr(1).toBuffer(), 0n);
    await status();

    logger('Updating tree[0] to 2 from private');
    await contract.methods
      .update_at_private(await getUpdateProof(0n, 2n))
      .send()
      .wait();
    await tree.updateLeaf(new Fr(2).toBuffer(), 0n);

    await status();

    const zeroProof = await getMembershipProof(0n, false);
    logger('"Reads" 0 from the tree');
    await contract.methods.read_at(zeroProof).send().wait();

    // Progress time to beyond the update and thereby commit it to the tree.
    await cheatCodes.aztec.warp((await cheatCodes.eth.timestamp()) + 1000);
    await tree.commit();
    logger('--- Progressing time to after the update ---');
    await status();

    logger('Tries to "read" 0 from the tree, but is rejected');
    await expect(contract.methods.read_at(zeroProof).simulate()).rejects.toThrowError(
      'Assertion failed: Root does not match expected',
    );
    logger('"Reads" 2 from the tree');
    await contract.methods
      .read_at(await getMembershipProof(0n, false))
      .send()
      .wait();

    logger('Updating tree[0] to 4 from private');
    await contract.methods
      .update_at_private(await getUpdateProof(0n, 4n))
      .send()
      .wait();
    await tree.updateLeaf(new Fr(4).toBuffer(), 0n);

    await status();
  }, 60_000);
});
