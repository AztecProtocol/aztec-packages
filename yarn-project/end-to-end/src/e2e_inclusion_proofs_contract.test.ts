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
  const publicValue = 236n;

  beforeAll(async () => {
    ({ pxe, teardown, wallets, accounts } = await setup(1));

    contract = await InclusionProofsContract.deploy(wallets[0], publicValue).send().deployed();
  }, 100_000);

  afterAll(() => teardown());

  it('creates a note and proves its existence', async () => {
    // Owner of a note
    const owner = accounts[0].address;
    {
      // Create a note
      const value = 100n;
      const receipt = await contract.methods.create_note(owner, value).send().wait({ debug: true });
      const { newCommitments, visibleNotes } = receipt.debugInfo!;
      expect(newCommitments.length).toBe(1);
      expect(visibleNotes.length).toBe(1);
      const [receivedValue, receivedOwner, _randomness] = visibleNotes[0].note.items;
      expect(receivedValue.toBigInt()).toBe(value);
      expect(receivedOwner).toEqual(owner.toField());
    }

    {
      // Prove note inclusion in a given block.
      // We prove the note existence at current block number because we don't currently have historical data
      const blockNumber = await pxe.getBlockNumber();
      await contract.methods.proveNoteInclusion(owner, blockNumber).send().wait();
    }

    {
      // Prove that the note has not been nullified
      // We prove the note existence at current block number because we don't currently have historical data
      const blockNumber = await pxe.getBlockNumber();
      await contract.methods.proveNullifierNonInclusion(owner, blockNumber, 0).send().wait();
    }

    {
      // We test the failure case now --> The proof should fail when the nullifier already exists
      const receipt = await contract.methods.nullifyNote(owner).send().wait({ debug: true });
      const { newNullifiers } = receipt.debugInfo!;
      expect(newNullifiers.length).toBe(2);

      const blockNumber = await pxe.getBlockNumber();
      const nullifier = newNullifiers[1];
      // Note: getLowNullifierMembershipWitness returns the membership witness of the nullifier itself and not
      // the low nullifier when the nullifier already exists in the tree and for this reason the execution fails
      // on low_nullifier.value < nullifier.value check.
      await expect(
        contract.methods.proveNullifierNonInclusion(owner, blockNumber, nullifier).send().wait(),
      ).rejects.toThrowError(/Proving that low_nullifier.value < nullifier.value failed/);
    }
  });

  it('proves an existence of a public value in private context', async () => {
    const blockNumber = await pxe.getBlockNumber();
    await contract.methods.provePublicValueInclusion(publicValue, blockNumber).send().wait();
  });

  it('proves existence of a nullifier in private context', async () => {
    const blockNumber = await pxe.getBlockNumber();
    const block = await pxe.getBlock(blockNumber);
    const nullifier = block?.newNullifiers[0];

    await contract.methods.proveNullifierInclusion(nullifier!, blockNumber).send().wait();
  });
});
