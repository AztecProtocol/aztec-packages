import { CheatCodes, DebugLogger, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { Pedersen, SparseTree, newTree } from '@aztec/merkle-tree';
import { SlowTreeContract } from '@aztec/noir-contracts/types';

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

  it('Messing around with noir slow tree', async () => {
    const depth = 254;
    const slowUpdateTreeSimulator = await newTree(
      SparseTree,
      levelup(createMemDown()),
      new Pedersen(await CircuitsWasm.get()),
      'test',
      depth,
    );
    const getMembershipProof = async (index: bigint, includeUncommitted: boolean) => {
      return {
        index,
        value: Fr.fromBuffer((await slowUpdateTreeSimulator.getLeafValue(index, includeUncommitted))!),
        // eslint-disable-next-line camelcase
        sibling_path: (await slowUpdateTreeSimulator.getSiblingPath(index, includeUncommitted)).toFieldArray(),
      };
    };

    const getMembershipMint = (proof: { index: bigint; value: Fr; sibling_path: Fr[] }) => {
      return [new Fr(proof.index), proof.value, ...proof.sibling_path];
    };

    const getUpdateProof = async (newValue: bigint, index: bigint) => {
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

    const getUpdateMint = (proof: {
      index: bigint;
      new_value: bigint;
      before: { value: Fr; sibling_path: Fr[] };
      after: { value: Fr; sibling_path: Fr[] };
    }) => {
      return [
        new Fr(proof.index),
        new Fr(proof.new_value),
        proof.before.value,
        ...proof.before.sibling_path,
        proof.after.value,
        ...proof.after.sibling_path,
      ];
    };

    const status = async (key: bigint) => {
      logger(`\tTime: ${await cheatCodes.eth.timestamp()}`);
      logger('\tRoot', await contract.methods.un_read_root(owner).view());
      logger(`\tLeaf (${key})`, await contract.methods.un_read_leaf_at(owner, key).view());
    };

    const owner = wallet.getCompleteAddress().address;
    const key = owner.toBigInt();

    await contract.methods.initialize().send().wait();

    logger('Initial state');
    await status(key);
    await wallet.addMint(getMembershipMint(await getMembershipProof(key, true)));
    await contract.methods.read_at(key).send().wait();

    logger(`Updating tree[${key}] to 1 from public`);
    await contract.methods
      .update_at_public(await getUpdateProof(1n, key))
      .send()
      .wait();
    await slowUpdateTreeSimulator.updateLeaf(new Fr(1).toBuffer(), key);
    await status(key);

    const zeroProof = await getMembershipProof(key, false);
    logger(`"Reads" tree[${zeroProof.index}] from the tree, equal to ${zeroProof.value}`);
    await wallet.addMint(getMembershipMint({ ...zeroProof, value: new Fr(0) }));
    await contract.methods.read_at(key).send().wait();

    // Progress time to beyond the update and thereby commit it to the tree.
    await cheatCodes.aztec.warp((await cheatCodes.eth.timestamp()) + 1000);
    await slowUpdateTreeSimulator.commit();
    logger('--- Progressing time to after the update ---');
    await status(key);

    logger(
      `Tries to "read" tree[${zeroProof.index}] from the tree, but is rejected as value is not ${zeroProof.value}`,
    );
    await wallet.addMint(getMembershipMint({ ...zeroProof, value: new Fr(0) }));
    await expect(contract.methods.read_at(key).simulate()).rejects.toThrowError(
      'Assertion failed: Root does not match expected',
    );

    logger(`"Reads" tree[${key}], expect to be 1`);
    await wallet.addMint(getMembershipMint({ ...zeroProof, value: new Fr(1) }));
    await contract.methods.read_at(key).send().wait();

    logger(`Updating tree[${key}] to 4 from private`);
    await wallet.addMint(getUpdateMint(await getUpdateProof(4n, key)));
    await contract.methods.update_at_private(key, 4n).send().wait();
    await slowUpdateTreeSimulator.updateLeaf(new Fr(4).toBuffer(), key);

    await status(key);
  }, 200_000);
});
