import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { DomainSeparator, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { siloNullifier } from '@aztec/stdlib/hash';
import {
  computeAppNullifierHidingKey,
  computeAppSecretKey,
  deriveMasterNullifierHidingSecretKey,
  deriveMasterOutgoingViewingSecretKey,
  derivePublicKeyFromSecretKey,
  hashPublicKey,
} from '@aztec/stdlib/keys';

import { jest } from '@jest/globals';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Covers cryptographic key derivation and usage: nhk_app-based nullification detection and
// ovsk_app retrieval via the TestContract. Single automine node, one funded Schnorr account,
// TestContract deployed in beforeAll.
describe('automine/accounts/keys', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  let testContract: TestContract;

  let secret: Fr;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;

  beforeAll(async () => {
    // This test needs the account's secret, so we provide and create the account ourselves.
    const [account] = await generateSchnorrAccounts(1);
    ({ aztecNode, teardown, wallet } = (
      await AutomineTestContext.setup({ numberOfAccounts: 0, additionallyFundedAccounts: [account] })
    ).context);
    await wallet.createSchnorrInitializerlessAccount(account.secret, account.salt, account.signingKey);
    defaultAccountAddress = account.address;
    secret = account.secret;

    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Demonstrates that an observer holding nhk_app and the contract address can detect when a note
  // they did not create has been nullified, by scanning all note hashes and re-deriving nullifiers.
  describe('using nhk_app to detect nullification', () => {
    //    This test checks that it is possible to detect that a note has been nullified just by using nhk_app. Note
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
    // need nhk_app and the contract address of the DeFi contract to detect the nullification of the initial note.
    // Creates a note, asserts 0 nullified notes. Destroys the note, scans all blocks for matching
    // nullifiers derived from nhk_app and asserts exactly 1 nullified note.
    it('nhk_app and contract address are enough to detect note nullification', async () => {
      const masterNullifierHidingSecretKey = deriveMasterNullifierHidingSecretKey(secret);
      const nhkApp = await computeAppNullifierHidingKey(masterNullifierHidingSecretKey, testContract.address);

      const noteValue = 5;
      const noteStorageSlot = 12;

      await testContract.methods
        .call_create_note(noteValue, defaultAccountAddress, noteStorageSlot, false)
        .send({ from: defaultAccountAddress });

      expect(await getNumNullifiedNotes(nhkApp, testContract.address)).toEqual(0);

      await testContract.methods
        .call_destroy_note(defaultAccountAddress, noteStorageSlot)
        .send({ from: defaultAccountAddress });

      expect(await getNumNullifiedNotes(nhkApp, testContract.address)).toEqual(1);
    });

    const getNumNullifiedNotes = async (nhkApp: Fr, contractAddress: AztecAddress) => {
      // 1. Get all the note hashes
      const blocks = await aztecNode.getBlocks(BlockNumber(INITIAL_L2_BLOCK_NUM), 1000, {
        includeTransactions: true,
      });
      const noteHashes = blocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.noteHashes));
      // 2. Get all the seen nullifiers
      const nullifiers = blocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.nullifiers));
      // 3. Derive all the possible nullifiers using nhkApp
      const derivedNullifiers = await Promise.all(
        noteHashes.map(async noteHash => {
          const innerNullifier = await poseidon2HashWithSeparator([noteHash, nhkApp], DomainSeparator.NOTE_NULLIFIER);
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

  // Verifies that the on-chain get_ovsk_app circuit function returns the same ovsk_app as the
  // TypeScript derivation path (deriveMasterOutgoingViewingSecretKey + computeAppSecretKey).
  describe('ovsk_app', () => {
    // Derives ovsk_app in TS, calls get_ovsk_app on-chain, and compares the field values.
    it('gets ovsk_app', async () => {
      // Derive the ovpk_m_hash from the account secret. Use `hashPublicKey` (the
      // domain-separated hash over `[x, y]`) rather than `Point.hash()` (which hashes
      // `[x, y, is_infinite]` with no separator) -- the PXE's `KeyStore.addAccount` stores
      // master-key hashes computed via `hashPublicKey`, so this is what the
      // `aztec_utl_getKeyValidationRequest` lookup compares against.
      const ovskM = deriveMasterOutgoingViewingSecretKey(secret);
      const ovpkMHash = await hashPublicKey(await derivePublicKeyFromSecretKey(ovskM));

      // Compute the expected ovsk_app
      const expectedOvskApp = await computeAppSecretKey(ovskM, testContract.address, 'ov');

      // Get the ovsk_app via the test contract
      const { result: ovskAppBigInt } = await testContract.methods
        .get_ovsk_app(ovpkMHash)
        .simulate({ from: defaultAccountAddress });
      const ovskApp = new Fr(ovskAppBigInt);

      // Check that the ovsk_app is as expected
      expect(ovskApp.equals(expectedOvskApp)).toBeTrue();
    });
  });
});
