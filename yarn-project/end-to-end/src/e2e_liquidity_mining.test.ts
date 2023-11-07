import { AccountWallet, CheatCodes, CompleteAddress, DebugLogger } from '@aztec/aztec.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { Pedersen, SparseTree, newTree } from '@aztec/merkle-tree';
import { LiquidityMiningContract } from '@aztec/noir-contracts/types';

import { jest } from '@jest/globals';
import levelup from 'levelup';
import { type MemDown, default as memdown } from 'memdown';

import { setup } from './fixtures/utils.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const TIMEOUT = 90_000;

describe('e2e_liquidity_mining', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let logger: DebugLogger;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let cheatCodes: CheatCodes;

  let contract: LiquidityMiningContract;

  let simulatorTree: SparseTree;

  beforeAll(async () => {
    ({ teardown, logger, wallets, accounts, cheatCodes } = await setup(4));

    contract = await LiquidityMiningContract.deploy(wallets[0]).send().deployed();

    const db = levelup(createMemDown());
    const hasher = new Pedersen(await CircuitsWasm.get());
    const depth = 254;
    simulatorTree = await newTree(SparseTree, db, hasher, 'test', depth);
  }, 100_000);

  afterAll(() => teardown());

});
