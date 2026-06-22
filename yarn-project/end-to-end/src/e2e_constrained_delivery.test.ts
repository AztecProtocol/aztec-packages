import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import {
  ConstrainedDeliveryTestContract,
  type DeliveryEvent,
} from '@aztec/noir-test-contracts.js/ConstrainedDeliveryTest';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup, setupPXEAndGetWallet } from './fixtures/setup.js';
import { TestWallet } from './test-wallet/test_wallet.js';

const ONCHAIN_CONSTRAINED = { inner: 3 };

describe('constrained delivery', () => {
  jest.setTimeout(300_000);

  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let batchRecipient: AztecAddress;
  let batchRecipient2: AztecAddress;
  let batchRecipient3: AztecAddress;
  let batchRecipient4: AztecAddress;
  let contract: ConstrainedDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient, batchRecipient, batchRecipient2, batchRecipient3, batchRecipient4],
    } = await setup(6, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await ConstrainedDeliveryTestContract.deploy(wallet).send({ from: sender }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('reuses an existing standard-registry constrained handshake', async () => {
    await contract.methods.emit_note(recipient, 1).send({ from: sender });

    const { result: secretAfterFirstSend } = await contract.methods
      .get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED)
      .simulate({ from: sender });
    expect(secretAfterFirstSend).toBeDefined();

    await contract.methods.emit_event(recipient, 1).send({ from: sender });

    const { result: secret } = await contract.methods
      .get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED)
      .simulate({ from: sender });
    // The second send reuses the handshake rather than bootstrapping a new one: the secret is unchanged.
    expect(secret).toEqual(secretAfterFirstSend);

    const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });

    expect(index).toEqual(2n);
  });

  // Constrained sends to one recipient form a strictly ordered sequence, so concurrent and batched sends behave
  // differently: parallel txs collide on the shared index nullifier, same-tx batches work only once the handshake is
  // committed, and batches that bootstrap a brand-new recipient re-handshake onto separate secrets. Each test uses
  // its own recipient.
  describe('concurrency and batching', () => {
    // Constrained sends to one `(sender, recipient)` pair are strictly ordered: the first send bootstraps the
    // handshake and every send emits a nullifier keyed only on `(sender, recipient, secret, index)`. Two sends fired
    // in parallel read the same index and collide, so one tx is rejected. Marked `it.failing` because this is a
    // protocol limitation, not a bug: it documents the constraint and will start failing (prompting its removal) if
    // parallel sends to a single pair ever become supported. The working alternative is the batched test below.
    it.failing('cannot fan out constrained sends on the same sequence in parallel', async () => {
      await Promise.all([
        contract.methods.emit_note(recipient, 1).send({ from: sender }),
        contract.methods.emit_note(recipient, 1).send({ from: sender }),
      ]);
    });

    // CAN batch (1): a contract call may emit several constrained messages to one recipient in a single tx; each
    // later emit proves the previous nullifier as a same-tx pending nullifier. The handshake must already be
    // committed (see the re-handshake test below), so it is established first; a fresh recipient starts at index 0,
    // so two emits land indices 0 and 1 and the next index is 2.
    it('lands multiple constrained sends from a single contract call on an established handshake', async () => {
      await registry.methods
        .non_interactive_handshake(sender, batchRecipient, ONCHAIN_CONSTRAINED)
        .send({ from: sender });

      await contract.methods.emit_two_events(batchRecipient).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secret(sender, batchRecipient, ONCHAIN_CONSTRAINED)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(2n);
    });

    // CAN batch (2): client-side BatchCall aggregates separate calls into one tx with the same effect. The two
    // emit_note calls that fail as parallel txs (above) succeed batched, given an established handshake.
    it('lands the same two sends when aggregated into one tx with BatchCall', async () => {
      await registry.methods
        .non_interactive_handshake(sender, batchRecipient2, ONCHAIN_CONSTRAINED)
        .send({ from: sender });

      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient2, 1),
        contract.methods.emit_note(batchRecipient2, 1),
      ]).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secret(sender, batchRecipient2, ONCHAIN_CONSTRAINED)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(2n);
    });

    // CANNOT batch onto a brand-new recipient, even within a single contract call. The registry lookup that decides
    // reuse-vs-bootstrap is a utility call reading committed state, so the second emit cannot see the first emit's
    // pending bootstrap and re-handshakes onto a fresh secret (each handshake mints a new shared secret). The registry
    // keeps the second handshake, which holds a single log, so the next index is 1, not 2. This is why the
    // established-handshake tests above seed the handshake first.
    it('re-handshakes instead of reusing when sends bootstrap a new recipient in the same tx', async () => {
      await contract.methods.emit_two_events(batchRecipient3).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secret(sender, batchRecipient3, ONCHAIN_CONSTRAINED)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(1n);
    });

    // The same new-recipient limitation holds via client-side BatchCall: the two aggregated emit_note calls each
    // bootstrap and re-handshake onto separate secrets (the utility read can't see the first's pending bootstrap),
    // so the next index is 1, not 2. Confirms the constraint is in the utility read, not the batching mechanism.
    it('re-handshakes instead of reusing when BatchCall sends bootstrap a new recipient in the same tx', async () => {
      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient4, 1),
        contract.methods.emit_note(batchRecipient4, 1),
      ]).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secret(sender, batchRecipient4, ONCHAIN_CONSTRAINED)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(1n);
    });
  });
});

// A constrained message sent by an account on one PXE is discovered and read by a recipient whose account lives on a
// separate PXE, with no shared in-memory state: PXE B finds the message purely from on-chain logs plus the
// HandshakeRegistry. The two PXEs share one node, following the e2e_2_pxes pattern.
describe('cross-PXE constrained delivery', () => {
  jest.setTimeout(300_000);

  let aztecNode: AztecNode & AztecNodeDebug;
  let walletA: TestWallet;
  let walletB: TestWallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let additionallyFundedAccounts: InitialAccountData[];
  let contract: ConstrainedDeliveryTestContract;
  let teardownA: () => Promise<void>;
  let teardownB: () => Promise<void>;

  beforeAll(async () => {
    // PXE A holds the sender. The recipient is funded at genesis here but created and deployed on PXE B below.
    ({
      aztecNode,
      additionallyFundedAccounts,
      wallet: walletA,
      accounts: [sender],
      teardown: teardownA,
    } = await setup(1, {
      ...AUTOMINE_E2E_OPTS,
      additionallyFundedAccounts: await generateSchnorrAccounts(1, 'schnorr'),
    }));

    // PXE B holds the recipient on the same node; the recipient account's keys live only here.
    ({ wallet: walletB, teardown: teardownB } = await setupPXEAndGetWallet(
      aztecNode,
      aztecNode,
      {},
      undefined,
      'pxe-b',
    ));
    const recipientAccount = await walletB.createSchnorrAccount(
      additionallyFundedAccounts[0].secret,
      additionallyFundedAccounts[0].salt,
    );
    await (await recipientAccount.getDeployMethod()).send({ from: NO_FROM });
    recipient = recipientAccount.address;

    await ensureHandshakeRegistryPublished(walletA, sender);
    const { contract: deployed, instance } = await ConstrainedDeliveryTestContract.deploy(walletA).send({
      from: sender,
    });
    contract = deployed;

    // PXE B simulates both the app contract and the registry while discovering, so it must know both.
    await ensureHandshakeRegistryPublished(walletB, recipient);
    await walletB.registerContract(instance, ConstrainedDeliveryTestContract.artifact);
  });

  afterAll(async () => {
    await teardownB();
    await teardownA();
  });

  it('delivers multiple constrained events from PXE A that PXE B discovers', async () => {
    // Distinct values prove PXE B decrypts each message's content, not merely that a tagged log arrived; delivering
    // several on one sequence proves both the bootstrap send (index 0) and the reused-handshake sends are
    // discovered. Constrained sends to one pair are strictly ordered, so they go one tx at a time.
    const eventValues = [10n, 20n, 30n];
    const blockNumbers: number[] = [];
    for (const value of eventValues) {
      const { receipt } = await contract.methods.emit_event(recipient, value).send({ from: sender });
      blockNumbers.push(receipt.blockNumber!);
    }

    await walletB.sync();

    const events = await walletB.getPrivateEvents<DeliveryEvent>(ConstrainedDeliveryTestContract.events.DeliveryEvent, {
      contractAddress: contract.address,
      fromBlock: BlockNumber(Math.min(...blockNumbers)),
      toBlock: BlockNumber(Math.max(...blockNumbers) + 1),
      scopes: [recipient],
    });

    const discovered = events.map(e => e.event.value);
    expect(discovered.length).toBe(eventValues.length);
    for (const value of eventValues) {
      expect(discovered).toContainEqual(value);
    }
  });

  it('delivers multiple constrained notes from PXE A that PXE B reads back', async () => {
    // Same recipient and handshake as the events above, so these notes land at the following sequence indices.
    const noteValues = [40n, 50n, 60n];
    for (const value of noteValues) {
      await contract.methods.emit_note(recipient, value).send({ from: sender });
    }

    await walletB.sync();

    const constrainedDeliveryB = ConstrainedDeliveryTestContract.at(contract.address, walletB);
    // Count proves every delivered note was discovered; the sum of distinct values proves each was decrypted.
    const { result: count } = await constrainedDeliveryB.methods
      .get_note_count(recipient)
      .simulate({ from: recipient });
    expect(count).toEqual(BigInt(noteValues.length));

    const { result: sum } = await constrainedDeliveryB.methods.get_notes_sum(recipient).simulate({ from: recipient });
    expect(sum).toEqual(noteValues.reduce((acc, value) => acc + value, 0n));
  });
});
