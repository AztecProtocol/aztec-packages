import {
  AztecAddress,
  CheatCodes,
  Contract,
  ContractDeployer,
  EthAddress,
  Fr,
  Wallet,
  isContractDeployed,
} from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress, getContractDeploymentInfo } from '@aztec/circuits.js';
import { pedersenHashInputs, pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { INITIAL_LEAF, SparseTree, UpdateOnlyTree, newTree } from '@aztec/merkle-tree';
import { StatefulTestContract } from '@aztec/noir-contracts/types';
import { Hasher, PXE, TxStatus } from '@aztec/types';

import { default as levelup } from 'levelup';
import { type MemDown, default as memdown } from 'memdown';

import { setup } from './fixtures/utils.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

describe('e2e_stateful', () => {
  let pxe: PXE;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  let contract: StatefulTestContract;
  let cheatCodes: CheatCodes;

  beforeAll(async () => {
    ({ teardown, pxe, accounts, logger, wallet, cheatCodes } = await setup());
    const owner = accounts[0].address;

    contract = await StatefulTestContract.deploy(wallet, owner, 1).send().deployed();
  }, 100_000);

  afterAll(() => teardown());

  it('Messing around with noir slow struct', async () => {
    // [next_change, rootBefore, rootAfter, structBefore, structAfter]
    logger(await contract.methods.read_all_slow().view());

    // Update the "NEXT" value to be 1, but not the "CURRENT" value
    // Effect will take place 100 seconds later for this "demo".
    await contract.methods.set_slow_update(1).send().wait();

    logger(await contract.methods.read_all_slow().view());

    // Unsuccessful because not updated yet!
    // Private function call that in the end check publicly if root is the same
    await expect(contract.methods.is_matching(1).simulate()).rejects.toThrowError(
      "Assertion failed: Not matching slow updates tree 'valid'",
    );

    const current = await cheatCodes.eth.timestamp();
    await cheatCodes.aztec.warp(current + 1000);

    logger(await contract.methods.read_all_slow().view());

    // Successful because the value is updated! Notice, NO transaction performing the transition.
    // Private function call that in the end check publicly if root is the same
    const tx = await contract.methods.is_matching(1).send().wait();
    expect(tx.status).toBe(TxStatus.MINED);
  });

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

  it.only('Messing around with noir slow tree', async () => {
    const circuitsWasm = await CircuitsWasm.get();
    const hasher = new PedersenHasher(circuitsWasm);

    const db = levelup(createMemDown());
    const depth = 4;
    const tree = await newTree(SparseTree, db, hasher, 'test', depth);

    const path = (await tree.getSiblingPath(0n, true)).toFieldArray();

    const root = tree.getRoot(true);

    logger(await contract.methods.read_whitelist_inner().view());
    logger(await contract.methods.read_leaf_at(0).view());

    await contract.methods.set_initial_root(root).send().wait();

    logger(await contract.methods.read_whitelist_inner().view());
    logger(await contract.methods.read_leaf_at(0).view());

    await contract.methods.is_on_whitelist(0, 0, path).send().wait();

    await contract.methods.add_to_whitelist(0, accounts[0].address, path).send().wait();

    logger(await contract.methods.read_whitelist_inner().view());
    logger(await contract.methods.read_leaf_at(0).view());
  }, 60_000);
});
