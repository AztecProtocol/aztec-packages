import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import {
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
} from '@aztec/constants';
import { PendingNoteHashesContract } from '@aztec/noir-test-contracts.js/PendingNoteHashes';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

describe('e2e_pending_note_hashes_contract', () => {
  let aztecNode: AztecNode;
  let wallet: TestWallet;
  let owner: AztecAddress;
  let logger: Logger;
  let teardown: () => Promise<void>;
  let contract: PendingNoteHashesContract;

  beforeAll(async () => {
    ({
      teardown,
      aztecNode,
      wallet,
      logger,
      accounts: [owner],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
  });

  afterAll(() => teardown());

  // Find the most recent block containing tx effects; pipelining may produce empty blocks after a tx lands.
  const getLatestNonEmptyBlock = async () => {
    const latest = await aztecNode.getBlockNumber();
    for (let n = latest; n > 0; n--) {
      const block = (await aztecNode.getBlocks(n, 1, { includeTransactions: true }))[0];
      if (block.body.txEffects.length > 0) {
        return block;
      }
    }
    throw new Error('No non-empty block found');
  };

  const expectNoteHashesSquashedExcept = async (exceptFirstFew: number) => {
    const block = await getLatestNonEmptyBlock();

    const noteHashes = block.body.txEffects.flatMap(txEffect => txEffect.noteHashes);

    // all new note hashes should be zero (should be squashed)
    for (let c = 0; c < exceptFirstFew; c++) {
      expect(noteHashes[c]).not.toEqual(Fr.ZERO);
    }

    for (let c = exceptFirstFew; c < noteHashes.length; c++) {
      expect(noteHashes[c]).toEqual(Fr.ZERO);
    }
  };

  const expectNullifiersSquashedExcept = async (exceptFirstFew: number) => {
    const block = await getLatestNonEmptyBlock();

    const nullifierArray = block.body.txEffects.flatMap(txEffect => txEffect.nullifiers);

    // 0th nullifier should be nonzero (txHash), all others should be zero (should be squashed)
    for (let n = 0; n < exceptFirstFew + 1; n++) {
      logger.info(`Expecting nullifier ${n} to be nonzero`);
      expect(nullifierArray[n]).not.toEqual(Fr.ZERO); // 0th nullifier is txHash
    }
    for (let n = exceptFirstFew + 1; n < nullifierArray.length; n++) {
      expect(nullifierArray[n]).toEqual(Fr.ZERO);
    }
  };

  const expectNoteLogsSquashedExcept = async (exceptFirstFew: number) => {
    const block = await getLatestNonEmptyBlock();

    const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
    expect(privateLogs.length).toBe(exceptFirstFew);
  };

  const deployContract = async () => {
    logger.debug(`Deploying L2 contract...`);
    ({ contract } = await PendingNoteHashesContract.deploy(wallet).send({ from: owner }));
    logger.info(`L2 contract deployed at ${contract.address}`);
    return contract;
  };

  it('Aztec.nr function can "get" notes it just "inserted"', async () => {
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert_then_get_then_nullify_flat(mintAmount, owner, sender)
      .send({ from: owner });
  });

  it('Squash! Aztec.nr function can "create" and "nullify" note in the same TX', async () => {
    // Kernel will squash the noteHash and its nullifier.
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });
    await deployedContract.methods.get_note_zero_balance(owner).send({ from: owner });

    await expectNoteHashesSquashedExcept(0);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(0);
  });

  it('Squash! Aztec.nr function can "create" and "nullify" note in the same TX but the constrained note log survives', async () => {
    // Kernel will squash the noteHash and its nullifier, but NOT the note log: constrained-delivery logs are not
    // linked to the note for squashing, because recipients discover them by scanning the per-secret tag sequence and
    // a removed log would break the index chain. Note that constrained tagging is currently mocked with the
    // unconstrained derivation (#14565), so this asserts the squash behavior ahead of real constrained tagging.
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note_constrained.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await expectNoteHashesSquashedExcept(0);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(1);
  });

  it('Squash! Aztec.nr function can "create" and "nullify" note in the same TX with 2 note logs', async () => {
    // Kernel will squash the noteHash and its nullifier and both note logs
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note_extra_emit.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await expectNoteHashesSquashedExcept(0);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(0);
  });

  it('Squash! Aztec.nr function can "create" 2 notes and "nullify" both in the same TX', async () => {
    // Kernel will squash both noteHashes and their nullifier.
    // Realistic way to describe this test is "Mint notes A and B, then burn both in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert2_then_get2_then_nullify2_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await expectNoteHashesSquashedExcept(0);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(0);
  });

  it('Squash! Aztec.nr function can "create" 2 notes and "nullify" 1 in the same TX (kernel will squash one note + nullifier)', async () => {
    // Kernel will squash one noteHash and its nullifier.
    // The other note will become persistent!
    // Realistic way to describe this test is "Mint notes A and B, then burn note A in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert2_then_get2_then_nullify1_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await expectNoteHashesSquashedExcept(1);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(1);
  });

  it('Squash! Aztec.nr function can "create" 2 notes with the same note hash and "nullify" 1 in the same TX', async () => {
    // Kernel will squash one noteHash and its nullifier, where two notes with the same inner hash exist.
    // The other note will become persistent!
    // Realistic way to describe this test is "Mint notes A and B, then burn note A in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    const sender = owner;
    await deployedContract.methods
      .test_insert2_then_get2_then_nullify1_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note_static_randomness.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await expectNoteHashesSquashedExcept(1);
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(1);
  });

  it('Squash! Aztec.nr function can nullify a pending note and a persistent in the same TX', async () => {
    // Create 1 note in isolated TX.
    // Then, in a separate TX, create 1 new note and nullify BOTH notes.
    // In this second TX, the kernel will squash one note + nullifier,
    // but the nullifier for the persistent note (from the first TX) will itself become persistent.
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    const mintAmount = 65n;

    const deployedContract = await deployContract();

    // create persistent note
    const sender = owner;
    await deployedContract.methods.insert_note(mintAmount, owner, sender).send({ from: owner });

    await expectNoteHashesSquashedExcept(1); // first TX just creates 1 persistent note
    await expectNullifiersSquashedExcept(0);
    await expectNoteLogsSquashedExcept(1);

    // create another note, and nullify it and AND nullify the above-created note in the same TX
    await deployedContract.methods
      .test_insert1_then_get2_then_nullify2_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.insert_note.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    await deployedContract.methods.get_note_zero_balance(owner).send({ from: owner });

    // second TX creates 1 note, but it is squashed!
    await expectNoteHashesSquashedExcept(0);
    // the nullifier corresponding to this transient note is squashed, but the
    // other nullifier corresponding to the persistent note becomes persistent itself.
    await expectNullifiersSquashedExcept(1);
    await expectNoteLogsSquashedExcept(0);
  });

  it('get_notes function filters a nullified note created in a previous transaction', async () => {
    // Create a note in an isolated transaction.
    // In a subsequent transaction, we nullify the note and a call to 'get note' should
    // not return anything.
    // Remark: This test can be seen as a simplification of the previous one but has the merit to
    // isolate the simplest 'get note' filtering with a pending nullifier on a persistent note.
    const mintAmount = 65n;

    const deployedContract = await deployContract();
    const sender = owner;
    await deployedContract.methods.insert_note(mintAmount, owner, sender).send({ from: owner });

    // There is a single new note hash.
    await expectNoteHashesSquashedExcept(1);
    await expectNoteLogsSquashedExcept(1);

    await deployedContract.methods
      .test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        owner,
        sender,
        await deployedContract.methods.dummy.selector(),
        await deployedContract.methods.get_then_nullify_note.selector(),
      )
      .send({ from: owner });

    // There is a single new nullifier.
    await expectNullifiersSquashedExcept(1);
  });

  it('Should handle overflowing the kernel data structures in nested calls', async () => {
    // This test verifies that a transaction can emit more notes than MAX_NOTE_HASHES_PER_TX without failing, since
    // the notes are nullified and will be squashed by the kernel reset circuit.

    const notesPerIteration = Math.min(MAX_NOTE_HASHES_PER_CALL, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL);
    const minToNeedReset = Math.min(MAX_NOTE_HASHES_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX) + 1;
    const deployedContract = await deployContract();

    // We use 10 different recipients to send private logs to in order to avoid exceeding
    // UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN logs emitted for any single sender-recipient pair.
    const recipients = (
      await Promise.all(
        Array.from({ length: 10 }, () =>
          wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random()),
        ),
      )
    ).map(a => a.address);

    await deployedContract.methods
      .test_recursively_create_notes(recipients, Math.ceil(minToNeedReset / notesPerIteration))
      // Recipients need to be in scope so their keys are accessible for note creation.
      .send({ from: owner, additionalScopes: recipients });
  });
});
