import type { InitialAccountData } from '@aztec/accounts/testing';
import { type AztecAddress, type AztecNode, Fr, type L2Block, type Wallet } from '@aztec/aztec.js';
import { GeneratorIndex, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { siloNullifier } from '@aztec/stdlib/hash';
import {
  computeAppNullifierSecretKey,
  computeAppSecretKey,
  deriveMasterNullifierSecretKey,
  deriveMasterOutgoingViewingSecretKey,
  derivePublicKeyFromSecretKey,
} from '@aztec/stdlib/keys';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('Keys', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  let testContract: TestContract;

  let secret: Fr;
  let wallet: Wallet;

  beforeAll(async () => {
    let initialFundedAccounts: InitialAccountData[];
    ({ aztecNode, teardown, wallet, initialFundedAccounts } = await setup(1));

    testContract = await TestContract.deploy(wallet).send().deployed();

    secret = initialFundedAccounts[0].secret;
  });

  afterAll(() => teardown());

  describe('using nsk_app to detect nullification', () => {
    //    This test checks that it is possible to detect that a note has been nullified just by using nsk_app. Note
    // that this only works for non-transient notes as transient ones never emit a note hash which makes it
    // impossible to brute force their nullifier.
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
    //    Another example is withdrawing from DeFi and then immediately spending the funds. In this case, we would
    // need nsk_app and the contract address of the DeFi contract to detect the nullification of the initial note.
    it('nsk_app and contract address are enough to detect note nullification', async () => {
      const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secret);
      const nskApp = await computeAppNullifierSecretKey(masterNullifierSecretKey, testContract.address);

      const noteValue = 5;
      const noteOwner = wallet.getAddress();
      const noteStorageSlot = 12;

      await testContract.methods.call_create_note(noteValue, noteOwner, noteStorageSlot, false).send().wait();

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
      const derivedNullifiers = await Promise.all(
        noteHashes.map(async noteHash => {
          const innerNullifier = await poseidon2HashWithSeparator([noteHash, nskApp], GeneratorIndex.NOTE_NULLIFIER);
          return siloNullifier(contractAddress, innerNullifier);
        }),
      );
      // 4. Count the number of derived nullifiers that are in the nullifiers array
      return derivedNullifiers.reduce((count, derived) => {
        if (nullifiers.some(nullifier => nullifier.equals(derived))) {
          count++;
        }
        return count;
      }, 0);
    };
  });

  describe('ovsk_app', () => {
    it('gets ovsk_app', async () => {
      // Derive the ovpk_m_hash from the account secret
      const ovskM = deriveMasterOutgoingViewingSecretKey(secret);
      const ovpkMHash = await (await derivePublicKeyFromSecretKey(ovskM)).hash();

      // Compute the expected ovsk_app
      const expectedOvskApp = await computeAppSecretKey(ovskM, testContract.address, 'ov');

      // Get the ovsk_app via the test contract
      const ovskAppBigInt = await testContract.methods.get_ovsk_app(ovpkMHash).simulate();
      const ovskApp = new Fr(ovskAppBigInt);

      // Check that the ovsk_app is as expected
      expect(ovskApp.equals(expectedOvskApp)).toBeTrue();
    });
  });
});
