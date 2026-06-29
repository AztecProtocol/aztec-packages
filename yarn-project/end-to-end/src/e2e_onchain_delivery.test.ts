import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { FieldLike } from '@aztec/aztec.js/abi';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { HandshakeRegistryContract } from '@aztec/noir-contracts.js/HandshakeRegistry';
import { type DeliveryEvent, OnchainDeliveryTestContract } from '@aztec/noir-test-contracts.js/OnchainDeliveryTest';
import type { PXECreationOptions } from '@aztec/pxe/server';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup, setupPXEAndGetWallet } from './fixtures/setup.js';
import { TestWallet } from './test-wallet/test_wallet.js';

// The wallet hook that selects a message's tagging-secret source. Derived from the exported PXE options
// rather than importing the hook type, which `@aztec/pxe/server` does not re-export.
type SenderHook = NonNullable<NonNullable<PXECreationOptions['hooks']>['resolveTaggingSecretStrategy']>;

type Mode = 'constrained' | 'unconstrained';

// What PXE B is expected to observe for a (mode, source) cell:
// - 'discovered':         PXE B discovers every message PXE A sent (a working cell; asserted with `it`).
// - 'undiscoverable':     delivery lands onchain but PXE B cannot reconstruct the tag and discovers nothing. A
//                         TEMPORARY limitation of a not-yet-implemented path, asserted with `it.failing` so the cell
//                         turns red (prompting promotion to `it`) the moment the path starts working.
// - { type: 'rejected' }: PXE A's send is rejected in-circuit because the resolved source cannot back the mode. A
//                         PERMANENT soundness invariant, positively asserted with `it` against the panic message.
type RejectedOutcome = { type: 'rejected'; message: string };
type DeliveryOutcome = 'discovered' | 'undiscoverable' | RejectedOutcome;

const isRejectedOutcome = (outcome: DeliveryOutcome): outcome is RejectedOutcome => typeof outcome === 'object';

// Onchain private delivery has two orthogonal axes: the delivery MODE (constrained = nullifier-chained sequence;
// unconstrained = no nullifier, windowed scan) and the tagging-secret SOURCE, which the wallet's
// `resolveTaggingSecretStrategy` hook selects. This harness exercises the (mode, source) cells end to end across two
// PXEs that share only a node: PXE A sends, PXE B discovers purely from onchain logs plus the HandshakeRegistry.
//
// Cross-PXE is the meaningful setup: PXE B holds no sender state, so a cell only "discovers" a message if the source
// truly reached it, which is also what makes the undiscoverable and rejected cells meaningful.
function buildMessageDeliveryTest(opts: {
  description: string;
  // A single mode applies to both the event and note sends; `{ events, notes }` sends each in its own mode, which
  // exercises cross-mode handshake reuse: bootstrap in one mode, deliver in the other on the same handshake.
  mode: Mode | { events: Mode; notes: Mode };
  // Omitted = no hook, so the PXE applies its default strategy for the mode.
  senderHook?: SenderHook;
  // Recipient-side setup the source requires (e.g. registering a raw arbitrary secret); runs once after deployment.
  recipientRegistration?: (
    recipient: TestWallet,
    recipientAddress: AztecAddress,
    sender: AztecAddress,
  ) => Promise<void>;
  // Defaults to 'discovered'; see `DeliveryOutcome`.
  outcome?: DeliveryOutcome;
}) {
  const { description, mode, senderHook, recipientRegistration, outcome = 'discovered' } = opts;

  describe(description, () => {
    jest.setTimeout(300_000);

    const eventValues = [10n, 20n, 30n];
    const noteValues = [40n, 50n, 60n];

    let aztecNode: AztecNode & AztecNodeDebug;
    let walletSender: TestWallet;
    let walletRecipient: TestWallet;
    let sender: AztecAddress;
    let recipient: AztecAddress;
    let contractSender: OnchainDeliveryTestContract;
    let teardownSender: () => Promise<void>;
    let teardownRecipient: () => Promise<void>;
    // Discovery results captured in beforeAll, so the assertions in the actual tests below stay pure.
    // A failure during delivery fails beforeAll loudly instead of being swallowed as an expected red.
    let discoveredEvents: FieldLike[];
    let readNotes: bigint[];

    const { events: eventMode, notes: noteMode } = typeof mode === 'string' ? { events: mode, notes: mode } : mode;
    const sendEvent = (value: bigint) =>
      eventMode === 'constrained'
        ? contractSender.methods.emit_event(recipient, value)
        : contractSender.methods.emit_event_unconstrained(recipient, value);
    const sendNote = (value: bigint) =>
      noteMode === 'constrained'
        ? contractSender.methods.emit_note(recipient, value)
        : contractSender.methods.emit_note_unconstrained(recipient, value);

    beforeAll(async () => {
      // PXE A holds the sender and carries this cell's tagging-secret-strategy hook. The recipient is funded at genesis
      // here but created and deployed on the isolated PXE B below, so it carries no sender state from other cells.
      let additionallyFundedAccounts: InitialAccountData[];
      ({
        aztecNode,
        additionallyFundedAccounts,
        wallet: walletSender,
        accounts: [sender],
        teardown: teardownSender,
      } = await setup(1, {
        ...AUTOMINE_E2E_OPTS,
        additionallyFundedAccounts: await generateSchnorrAccounts(1, 'schnorr'),
        pxeCreationOptions: senderHook ? { hooks: { resolveTaggingSecretStrategy: senderHook } } : undefined,
      }));

      ({ wallet: walletRecipient, teardown: teardownRecipient } = await setupPXEAndGetWallet(
        aztecNode,
        aztecNode,
        {},
        undefined,
        'pxe-b',
      ));
      const recipientAccount = await walletRecipient.createSchnorrAccount(
        additionallyFundedAccounts[0].secret,
        additionallyFundedAccounts[0].salt,
      );
      await (await recipientAccount.getDeployMethod()).send({ from: NO_FROM });
      recipient = recipientAccount.address;

      await ensureHandshakeRegistryPublished(walletSender, sender);
      const { contract: deployed, instance } = await OnchainDeliveryTestContract.deploy(walletSender).send({
        from: sender,
      });
      contractSender = deployed;

      await ensureHandshakeRegistryPublished(walletRecipient, recipient);
      await walletRecipient.registerContract(instance, OnchainDeliveryTestContract.artifact);

      await recipientRegistration?.(walletRecipient, recipient, sender);

      // A rejected cell lands nothing: its send is exercised (and asserted) in the test body, not here, so the
      // matcher distinguishes the expected rejection from an unexpected infra error rather than beforeAll swallowing
      // it. Both teardowns and the sender/recipient/contract are assigned above, so afterAll stays safe.
      if (isRejectedOutcome(outcome)) {
        return;
      }

      // Constrained sends to one pair are strictly ordered, so deliver one tx at a time. The first send bootstraps the
      // handshake (when the source is a handshake); the rest reuse it.
      const blockNumbers: number[] = [];
      for (const value of eventValues) {
        const { receipt } = await sendEvent(value).send({ from: sender });
        blockNumbers.push(receipt.blockNumber!);
      }
      for (const value of noteValues) {
        await sendNote(value).send({ from: sender });
      }

      await walletRecipient.sync();

      const events = await walletRecipient.getPrivateEvents<DeliveryEvent>(
        OnchainDeliveryTestContract.events.DeliveryEvent,
        {
          contractAddress: contractSender.address,
          fromBlock: BlockNumber(Math.min(...blockNumbers)),
          toBlock: BlockNumber(Math.max(...blockNumbers) + 1),
          scopes: [recipient],
        },
      );
      discoveredEvents = events.map(e => e.event.value);

      const contractRecipient = OnchainDeliveryTestContract.at(contractSender.address, walletRecipient);
      const { result } = await contractRecipient.methods.get_note_values(recipient).simulate({ from: recipient });
      readNotes = result.storage.slice(0, Number(result.len));
    });

    afterAll(async () => {
      await teardownRecipient();
      await teardownSender();
    });

    if (isRejectedOutcome(outcome)) {
      it('PXE A cannot send: the resolved source cannot back the delivery mode', async () => {
        await expect(sendEvent(eventValues[0]).send({ from: sender })).rejects.toThrow(outcome.message);
      });
      return;
    }

    // `it.failing` passes while the assertion fails and turns into a suite failure once the path works, prompting
    // promotion to a plain `it`.
    const test = outcome === 'undiscoverable' ? it.failing : it;

    test('PXE B discovers the events delivered by PXE A', () => {
      expect(discoveredEvents.length).toBe(eventValues.length);
      for (const value of eventValues) {
        expect(discoveredEvents).toContainEqual(value);
      }
    });

    test('PXE B reads back the notes delivered by PXE A', () => {
      expect(readNotes).toEqual(noteValues);
    });
  });
}

describe('onchain delivery', () => {
  // GREEN: constrained always goes through a handshake (the PXE default for constrained).
  buildMessageDeliveryTest({
    description: 'constrained x handshake',
    mode: 'constrained',
  });

  // GREEN: unconstrained delivery whose source the wallet pins to a non-interactive handshake. The first send
  // bootstraps the handshake; PXE B discovers it via the registry and reads the (nullifier-free) unconstrained logs.
  buildMessageDeliveryTest({
    description: 'unconstrained x handshake',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  // GREEN: unconstrained delivery tagged with a raw secret the two parties share out of band. The sender's hook and
  // the recipient registration use the same point, generated once in `recipientRegistration` (which runs before any
  // send fires the hook).
  let arbitrarySecret: Point;
  buildMessageDeliveryTest({
    description: 'unconstrained x arbitrary secret',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'arbitrary-secret', secret: arbitrarySecret }),
    recipientRegistration: async (recipientWallet, recipientAddress) => {
      arbitrarySecret = await Point.random();
      await recipientWallet.registerArbitrarySecret(recipientAddress, arbitrarySecret);
    },
  });

  // TODO(F-770): With no hook, unconstrained delivery to an external recipient defaults to an address-derived
  // tag. PXE B holds no sender state, so it cannot reconstruct that tag and discovers nothing.
  buildMessageDeliveryTest({
    description: 'unconstrained x default to external recipient',
    mode: 'unconstrained',
    outcome: 'undiscoverable',
  });

  // GREEN: one handshake serves both modes. The constrained events bootstrap the handshake; the unconstrained notes
  // reuse it. Reuse bypasses the wallet hook entirely (an existing registry handshake is resolved before the hook is
  // consulted), so the hook returns a handshake for the bootstrapping constrained send but throws if it is ever
  // consulted for the unconstrained send. That makes discovery a durable proof of mode-agnostic reuse: were reuse to
  // regress, the unconstrained note would fall through to the hook and fail loudly instead of being silently
  // re-discovered some other way.
  buildMessageDeliveryTest({
    description: 'handshake bootstrapped constrained, reused unconstrained (cross-mode)',
    mode: { events: 'constrained', notes: 'unconstrained' },
    senderHook: ({ deliveryMode }) => {
      if (deliveryMode !== AppTaggingSecretKind.CONSTRAINED) {
        throw new Error(
          'cross-mode reuse regressed: the unconstrained send consulted the strategy hook instead of reusing the bootstrapped handshake',
        );
      }
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
  });

  // REJECTED: the mirror of the unconstrained x arbitrary-secret cell with constrained mode. An unconstrained secret
  // cannot back constrained delivery, so the circuit rejects the send. This pins the PXE -> circuit soundness
  // boundary that PXE deliberately delegates to the circuit.
  // The secret value is irrelevant to the rejection, so a fresh point per hook call is fine and no recipient
  // registration is needed.
  buildMessageDeliveryTest({
    description: 'constrained x arbitrary secret (rejected)',
    mode: 'constrained',
    senderHook: async () => ({ type: 'arbitrary-secret', secret: await Point.random() }),
    outcome: { type: 'rejected', message: 'an unconstrained tagging secret cannot back constrained delivery' },
  });
});

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
  let contract: OnchainDeliveryTestContract;
  let registry: HandshakeRegistryContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [sender, recipient, batchRecipient, batchRecipient2, batchRecipient3, batchRecipient4],
    } = await setup(6, { ...AUTOMINE_E2E_OPTS }));

    await ensureHandshakeRegistryPublished(wallet, sender);
    ({ contract } = await OnchainDeliveryTestContract.deploy(wallet).send({ from: sender }));
    registry = HandshakeRegistryContract.at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, wallet);
  });

  afterAll(() => teardown());

  it('reuses an existing standard-registry constrained handshake', async () => {
    await contract.methods.emit_note(recipient, 1).send({ from: sender });

    const { result: secretAfterFirstSend } = await contract.methods
      .get_app_siloed_secrets(sender, recipient)
      .simulate({ from: sender });
    expect(secretAfterFirstSend).toBeDefined();

    await contract.methods.emit_event(recipient, 1).send({ from: sender });

    const { result: secret } = await contract.methods
      .get_app_siloed_secrets(sender, recipient)
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
      await registry.methods.non_interactive_handshake(sender, batchRecipient).send({ from: sender });

      await contract.methods.emit_two_events(batchRecipient).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(2n);
    });

    // CAN batch (2): client-side BatchCall aggregates separate calls into one tx with the same effect. The two
    // emit_note calls that fail as parallel txs (above) succeed batched, given an established handshake.
    it('lands the same two sends when aggregated into one tx with BatchCall', async () => {
      await registry.methods.non_interactive_handshake(sender, batchRecipient2).send({ from: sender });

      await new BatchCall(wallet, [
        contract.methods.emit_note(batchRecipient2, 1),
        contract.methods.emit_note(batchRecipient2, 1),
      ]).send({ from: sender });

      const { result: secret } = await contract.methods
        .get_app_siloed_secrets(sender, batchRecipient2)
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
        .get_app_siloed_secrets(sender, batchRecipient3)
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
        .get_app_siloed_secrets(sender, batchRecipient4)
        .simulate({ from: sender });
      expect(secret).toBeDefined();

      const { result: index } = await contract.methods.next_index_for_secret(secret).simulate({ from: sender });
      expect(index).toEqual(1n);
    });
  });
});
