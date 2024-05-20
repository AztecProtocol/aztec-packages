import { createAccounts } from '@aztec/accounts/testing';
import { type AccountWallet, type AztecAddress, type AztecNode, Fr, type L2Block, type PXE } from '@aztec/aztec.js';
import {
  GeneratorIndex,
  INITIAL_L2_BLOCK_NUM,
  computeAppNullifierSecretKey,
  deriveMasterNullifierSecretKey,
} from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { TestContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('Key Registry', () => {
  let pxe: PXE;
  let aztecNode: AztecNode;
  let testContract: TestContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];

  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ aztecNode, teardown, pxe, wallets } = await setup(2));
    testContract = await TestContract.deploy(wallets[0]).send().deployed();

    await publicDeployAccounts(wallets[0], wallets.slice(0, 2));
  });

  afterAll(() => teardown());

  describe('using nsk_app to detect nullification', () => {
    //    This test checks that it possible to detect that a note has been nullified just by using nsk_app. Note that
    // this only works for non-transient notes as transient ones never emit a note hash which makes it impossible
    // to brute force their nullifier.
    //    This might seem to make the scheme useless in practice. This could not be the case because if you have
    // a note of funds, when you create the transient you are nullifying that note. So even if I cannot see when you
    // nullified the transient ones, I can see that you nullified the first.
    //
    // E.g.: Say you have a note A, which is 10 $, you nullify it (I can see) and create B and C, that you then spend.
    // I cannot see B and C, but I saw A, so I knew that you did something with those funds.
    //
    //    There are some examples where the action is fully hidden though. One of those examples is shielding where you
    // instantly consume the note after creating it. In this case, the nullifier is never emitted and hence the action
    // is impossible to detect with this scheme.
    it('nsk_app and contract address are enough to detect note nullification', async () => {
      const secret = Fr.random();
      const [account] = await createAccounts(pxe, 1, [secret]);

      const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secret);
      const nskApp = computeAppNullifierSecretKey(masterNullifierSecretKey, testContract.address);

      const noteValue = 5;
      const noteOwner = account.getAddress();
      const noteStorageSlot = 12;

      await testContract.methods.call_create_note(noteValue, noteOwner, noteStorageSlot).send().wait();

      expect(await getNumNullifiedNotes(nskApp, testContract.address)).toEqual(0);

      await testContract.methods.call_destroy_note(noteStorageSlot).send().wait();

      expect(await getNumNullifiedNotes(nskApp, testContract.address)).toEqual(1);
    });

    const getNumNullifiedNotes = async (nskApp: Fr, contractAddress: AztecAddress) => {
      // 1. Get all the note hashes
      const blocks = await aztecNode.getBlocks(INITIAL_L2_BLOCK_NUM, 1000);
      const noteHashes = blocks.flatMap((block: L2Block) =>
        block.body.txEffects.flatMap(txEffect => txEffect.noteHashes),
      );
      // 2. Get all the seen nullifiers
      const nullifiers = blocks.flatMap((block: L2Block) =>
        block.body.txEffects.flatMap(txEffect => txEffect.nullifiers),
      );
      // 3. Derive all the possible nullifiers using nskApp
      const derivedNullifiers = noteHashes.map(noteHash => {
        const innerNullifier = poseidon2Hash([noteHash, nskApp, GeneratorIndex.NOTE_NULLIFIER]);
        return siloNullifier(contractAddress, innerNullifier);
      });
      // 4. Count the number of derived nullifiers that are in the nullifiers array
      return derivedNullifiers.reduce((count, derived) => {
        if (nullifiers.some(nullifier => nullifier.equals(derived))) {
          count++;
        }
        return count;
      }, 0);
    };
  });
});
