import { AccountWallet, CompleteAddress, PXE } from '@aztec/aztec.js';
import { InclusionProofsContract } from '@aztec/noir-contracts/types';

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

  beforeAll(async () => {
    ({ pxe, teardown, wallets, accounts } = await setup(1));

    contract = await InclusionProofsContract.deploy(wallets[0]).send().deployed();
  }, 100_000);

  afterAll(() => teardown());

  it('creates a note and proves its existence', async () => {
    // Owner of a note
    const owner = accounts[0].address;
    {
      // Create note
      const amount = 100n;
      const receipt = await contract.methods.create_note(owner, amount).send().wait({ debug: true });
      const { newCommitments, visibleNotes } = receipt.debugInfo!;
      expect(newCommitments.length).toBe(1);
      expect(visibleNotes.length).toBe(1);
      const [receivedAmount, receivedOwner, _randomness] = visibleNotes[0].note.items;
      expect(receivedAmount.toBigInt()).toBe(amount);
      expect(receivedOwner).toEqual(owner.toField());
    }

    {
      // Prove note inclusion in a given block.
      // We prove the note existence at current block number because we don't currently have historical data
      const blockNumber = await pxe.getBlockNumber();
      await contract.methods.proveNoteInclusion(accounts[0].address, blockNumber).send().wait();
    }

    {
      // Prove that the note has not been nullified
      // We prove the note existence at current block number because we don't currently have historical data
      const blockNumber = await pxe.getBlockNumber();
      await contract.methods.proveNullifierNonInclusion(accounts[0].address, blockNumber).send().wait();
    }
  });
});
