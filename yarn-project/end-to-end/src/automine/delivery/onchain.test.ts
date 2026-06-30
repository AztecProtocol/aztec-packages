import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { FieldLike } from '@aztec/aztec.js/abi';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { type DeliveryEvent, OnchainDeliveryTestContract } from '@aztec/noir-test-contracts.js/OnchainDeliveryTest';
import type { PXECreationOptions } from '@aztec/pxe/server';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from '../../fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup, setupPXEAndGetWallet } from '../../fixtures/setup.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';

// The wallet hook that selects a message's tagging-secret source. Derived from the exported PXE options
// rather than importing the hook type, which `@aztec/pxe/server` does not re-export.
type SenderHook = NonNullable<NonNullable<PXECreationOptions['hooks']>['resolveTaggingSecretStrategy']>;

type Mode = 'constrained' | 'unconstrained';

// A single mode applies to both the event and note sends; `{ events, notes }` sends each in its own mode, which
// exercises cross-mode handshake reuse: bootstrap in one mode, deliver in the other on the same handshake.
type DeliveryMode = Mode | { events: Mode; notes: Mode };

const formatMode = (mode: DeliveryMode): string => (typeof mode === 'string' ? mode : `${mode.events}->${mode.notes}`);

// Onchain private delivery has two orthogonal axes: the delivery MODE (constrained = nullifier-chained sequence;
// unconstrained = no nullifier, windowed scan) and the tagging-secret SOURCE, which the wallet's
// `resolveTaggingSecretStrategy` hook selects. This harness exercises (strategy, mode) cells end to end across two
// PXEs that share only a node: the sender PXE sends, the recipient PXE discovers purely from onchain logs plus the
// HandshakeRegistry.
//
// Cross-PXE is the meaningful setup: the recipient PXE holds no sender state, so a cell only "discovers" a message if
// the source truly reached it.
function buildMessageDeliveryTest(opts: {
  // Names the tagging-secret source, e.g. 'handshake' or 'arbitrary secret'. The describe title is derived as
  // `${strategy} x ${mode}`.
  strategy: string;
  mode: DeliveryMode;
  // Required: every cell states its source explicitly rather than leaning on the PXE default (covered by unit tests).
  senderHook: SenderHook;
  // Recipient-side setup the source requires (e.g. registering a raw arbitrary secret); runs once after deployment.
  recipientRegistration?: (
    recipient: TestWallet,
    recipientAddress: AztecAddress,
    sender: AztecAddress,
  ) => Promise<void>;
}) {
  const { strategy, mode, senderHook, recipientRegistration } = opts;
  const description = `${strategy} x ${formatMode(mode)}`;

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
      // The sender PXE holds the sender and carries this cell's tagging-secret-strategy hook. The recipient is funded
      // at genesis here but created and deployed on the isolated recipient PXE below, so it carries no sender state
      // from other cells.
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
        pxeCreationOptions: { hooks: { resolveTaggingSecretStrategy: senderHook } },
      }));

      ({ wallet: walletRecipient, teardown: teardownRecipient } = await setupPXEAndGetWallet(
        aztecNode,
        aztecNode,
        {},
        undefined,
        'pxe-recipient',
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

    it('the recipient PXE discovers the events delivered by the sender PXE', () => {
      expect(discoveredEvents.length).toBe(eventValues.length);
      for (const value of eventValues) {
        expect(discoveredEvents).toContainEqual(value);
      }
    });

    it('the recipient PXE reads back the notes delivered by the sender PXE', () => {
      expect(readNotes).toEqual(noteValues);
    });
  });
}

describe('automine/delivery/onchain', () => {
  // constrained always goes through a handshake. Stated explicitly rather than relying on the PXE default.
  buildMessageDeliveryTest({
    strategy: 'handshake',
    mode: 'constrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  // unconstrained delivery whose source the wallet pins to a non-interactive handshake. The first send
  // bootstraps the handshake; the recipient PXE discovers it via the registry and reads the unconstrained logs.
  buildMessageDeliveryTest({
    strategy: 'handshake',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  // unconstrained delivery tagged with a raw secret the two parties share out of band. The sender's hook and
  // the recipient registration use the same point, generated once in `recipientRegistration` (which runs before any
  // send fires the hook).
  let arbitrarySecret: Point;
  buildMessageDeliveryTest({
    strategy: 'arbitrary secret',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'arbitrary-secret', secret: arbitrarySecret }),
    recipientRegistration: async (recipientWallet, recipientAddress) => {
      arbitrarySecret = await Point.random();
      await recipientWallet.registerTaggingSecretSource({
        kind: 'arbitrary-secret',
        recipient: recipientAddress,
        secret: arbitrarySecret,
      });
    },
  });

  // the address-derived source, which is the unconstrained default. With the recipient registering the sender,
  // the recipient PXE reconstructs the address-derived tag and discovers the delivery.
  buildMessageDeliveryTest({
    strategy: 'address-derived',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'address-derived' }),
    recipientRegistration: async (recipientWallet, _recipientAddress, senderAddress) => {
      await recipientWallet.registerSender(senderAddress);
    },
  });

  // one handshake serves both modes. The constrained events bootstrap the handshake; the unconstrained notes
  // reuse it. Reuse bypasses the wallet hook entirely (an existing registry handshake is resolved before the hook is
  // consulted), so the hook returns a handshake for the bootstrapping constrained send but throws if it is ever
  // consulted for the unconstrained send. That makes discovery a durable proof of mode-agnostic reuse: were reuse to
  // regress, the unconstrained note would fall through to the hook and fail loudly instead of being silently
  // re-discovered some other way.
  buildMessageDeliveryTest({
    strategy: 'handshake',
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

  // the stricter cross-mode direction. The unconstrained events bootstrap the handshake; the constrained
  // notes reuse it. The tripwire makes reuse a hard guarantee: a constrained send that consulted the hook would throw,
  // and the only way to skip the hook is resolving an existing handshake, so a green means the notes reused the
  // bootstrapped handshake. It also pins the constrained sequence to a fresh index 0: index 0 validates against the
  // registry, higher indices assert a predecessor nullifier, so a sender index leaked from the unconstrained counter
  // would make the first note demand a predecessor that was never emitted and fail the actual send.
  // The index is never read here; the circuit rejecting a wrong one is the signal. The forward cell can't catch
  // this because its reusing side is unconstrained, where the index only feeds the tag and the scan tolerates gaps.
  buildMessageDeliveryTest({
    strategy: 'handshake',
    mode: { events: 'unconstrained', notes: 'constrained' },
    senderHook: ({ deliveryMode }) => {
      if (deliveryMode !== AppTaggingSecretKind.UNCONSTRAINED) {
        throw new Error(
          'cross-mode reuse regressed: the constrained send consulted the strategy hook instead of reusing the bootstrapped handshake',
        );
      }
      return Promise.resolve({ type: 'non-interactive-handshake' });
    },
  });
});
