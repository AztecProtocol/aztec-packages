import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
  EthAddress,
  Fr,
  INITIAL_L2_BLOCK_NUM,
  PXE,
  Point,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { NewContractData } from '@aztec/circuits.js';
import { computeContractLeaf } from '@aztec/circuits.js/abis';
import { InclusionProofsContract } from '@aztec/noir-contracts.js/InclusionProofs';

import { jest } from '@jest/globals';
import { type MemDown, default as memdown } from 'memdown';

import { setup } from './fixtures/utils.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const TIMEOUT = 90_000;

describe('e2e_inclusion_proofs_contract', () => {
  jest.setTimeout(TIMEOUT);

  let pxe: PXE;
  let teardown: () => Promise<void>;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];

  let contract: InclusionProofsContract;
  let deploymentBlockNumber: number;
  const publicValue = 236n;
  const contractAddressSalt = Fr.random();

  beforeAll(async () => {
    ({ pxe, teardown, wallets, accounts } = await setup(1));

    const receipt = await InclusionProofsContract.deploy(wallets[0], publicValue).send({ contractAddressSalt }).wait();
    contract = receipt.contract;
    deploymentBlockNumber = receipt.blockNumber!;
  }, 100_000);

  afterAll(() => teardown());

  describe('note inclusion and nullifier non-inclusion', () => {
    let owner: AztecAddress;

    beforeAll(() => {
      owner = accounts[0].address;
    });

    it('succeeds', async () => {
      console.log('cool')
    });
  });
});
