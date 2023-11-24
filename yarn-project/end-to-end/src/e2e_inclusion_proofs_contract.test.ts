import { AccountWallet, CompleteAddress, DebugLogger, PXE } from '@aztec/aztec.js';
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
  let logger: DebugLogger;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];

  let contract: InclusionProofsContract;

  beforeAll(async () => {
    ({ pxe, teardown, logger, wallets, accounts } = await setup(1));

    contract = await InclusionProofsContract.deploy(wallets[0]).send().deployed();
  }, 100_000);

  afterAll(() => teardown());

  it('mints and claims', async () => {
    // The account which apes into the pool
    const ape = accounts[0].address;
    {
      // Mint
      const mintAmount = 100n;
      const receipt = await contract.methods.mint(ape, mintAmount).send().wait({ debug: true });
      const { newCommitments, visibleNotes } = receipt.debugInfo!;
      expect(newCommitments.length).toBe(1);
      expect(visibleNotes.length).toBe(1);
      const [noteAmount, noteOwner, _randomness] = visibleNotes[0].note.items;
      expect(noteAmount.value).toBe(mintAmount);
      expect(noteOwner).toEqual(ape.toField());
    }

    {
      // Claim
      // We prove the note existence at current block number because we don't currently have historical data
      const blockNumber = await pxe.getBlockNumber();
      const receipt = await contract.methods.claim(accounts[0].address, blockNumber).send().wait({ debug: true });
      const { newNullifiers } = receipt.debugInfo!;
      expect(newNullifiers.length).toBe(2); // tx hash and note nullifier
    }
  });
});
