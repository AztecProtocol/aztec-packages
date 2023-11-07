import {
  AccountWallet,
  CheatCodes,
  CompleteAddress,
  DebugLogger
} from '@aztec/aztec.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { Pedersen, SparseTree, newTree } from '@aztec/merkle-tree';
import { SlowTreeContract } from '@aztec/noir-contracts/types';

import { jest } from '@jest/globals';
import levelup from 'levelup';
import { default as memdown, type MemDown } from 'memdown';

import { setup } from './fixtures/utils.js';
import { TokenSimulator } from './simulators/token_simulator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const TIMEOUT = 90_000;

describe('e2e_liquidity_mining', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let tokenSim: TokenSimulator;

  let tree: SparseTree;

  let cheatCodes: CheatCodes;

  beforeAll(async () => {
    ({ teardown, logger, wallets, accounts, cheatCodes } = await setup(4));

    slowTree = await SlowTreeContract.deploy(wallets[0]).send().deployed();

    const db = levelup(createMemDown());
    const hasher = new Pedersen(await CircuitsWasm.get());
    const depth = 254;
    tree = await newTree(SparseTree, db, hasher, 'test', depth);

  }, 100_000);

  afterAll(() => teardown());

  afterEach(async () => {
    await tokenSim.check();
  }, TIMEOUT);
});
