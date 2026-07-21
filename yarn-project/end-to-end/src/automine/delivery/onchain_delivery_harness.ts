import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import type { FieldLike } from '@aztec/aztec.js/abi';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { AccountManager } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { type DeliveryEvent, OnchainDeliveryTestContract } from '@aztec/noir-test-contracts.js/OnchainDeliveryTest';
import type { CustomRequest, ResolveCustomRequest, ResolveTaggingSecretStrategy } from '@aztec/pxe/config';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from '../../fixtures/fixtures.js';
import { ensureHandshakeRegistryPublished, setup, setupPXEAndGetWallet } from '../../fixtures/setup.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';

// Builds the hook serving custom requests issued during the sender's simulations. Installed on the sender PXE at
// creation but built only once the recipient exists, since serving typically needs the recipient's wallet and keys.
export type CustomRequestResponder = (
  recipient: TestWallet,
  recipientAccount: InitialAccountData,
  recipientCompleteAddress: CompleteAddress,
) => ResolveCustomRequest;

export type Mode = 'constrained' | 'unconstrained';

// A single mode applies to both the event and note sends; `{ events, notes }` sends each in its own mode, which
// exercises cross-mode handshake reuse: bootstrap in one mode, deliver in the other on the same handshake.
export type DeliveryMode = Mode | { events: Mode; notes: Mode };

const formatMode = (mode: DeliveryMode): string => (typeof mode === 'string' ? mode : `${mode.events}->${mode.notes}`);

// Onchain private delivery has two orthogonal axes: the delivery MODE (constrained = nullifier-chained sequence;
// unconstrained = no nullifier, windowed scan) and the tagging-secret SOURCE, which the wallet's
// `resolveTaggingSecretStrategy` hook selects. This harness exercises (strategy, mode) cells end to end across two
// PXEs that share only a node: the sender PXE sends, the recipient PXE discovers purely from onchain logs plus the
// HandshakeRegistry.
//
// Cross-PXE is the meaningful setup: the recipient PXE holds no sender state, so a cell only "discovers" a message if
// the source truly reached it.
export function buildMessageDeliveryTest(opts: {
  // Names the tagging-secret source, e.g. 'non-interactive handshake' or 'arbitrary secret'. The describe title is
  // derived as `${strategy} x ${mode}`.
  strategy: string;
  mode: DeliveryMode;
  // Required: every cell states its source explicitly rather than leaning on the PXE default (covered by unit tests).
  senderHook: ResolveTaggingSecretStrategy;
  // Recipient-side setup the source requires (e.g. registering a raw arbitrary secret); runs once after deployment.
  recipientRegistration?: (
    recipient: TestWallet,
    recipientAddress: AztecAddress,
    sender: AztecAddress,
  ) => Promise<void>;
  // Serves the custom requests issued during the sender's simulations (e.g. the registry's interactive-handshake
  // signature request).
  customRequestResponder?: CustomRequestResponder;
  // Extra `it()`s to register in this cell's suite, e.g. assertions against state a custom `senderHook` recorded.
  // Called inside the same `describe`, after the two baseline assertions below, so it shares their `beforeAll`
  // instead of depending on Jest's cross-`describe` execution order.
  additionalTests?: () => void;
}) {
  const { strategy, mode, senderHook, recipientRegistration, customRequestResponder, additionalTests } = opts;
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

    let additionallyFundedAccounts: InitialAccountData[];
    let recipientAccount: AccountManager | undefined;
    let customRequestCount = 0;

    beforeAll(async () => {
      // The sender PXE holds the sender and carries this cell's tagging-secret-strategy hook. The recipient is funded
      // at genesis here but created and deployed on the isolated recipient PXE below, so it carries no sender state
      // from other cells.
      ({
        aztecNode,
        additionallyFundedAccounts,
        wallet: walletSender,
        accounts: [sender],
        teardown: teardownSender,
      } = await setup(1, {
        ...AUTOMINE_E2E_OPTS,
        additionallyFundedAccounts: await generateSchnorrAccounts(1, 'schnorr'),
        pxeCreationOptions: {
          hooks: {
            resolveTaggingSecretStrategy: senderHook,
            resolveCustomRequest: async (request: CustomRequest) => {
              if (!customRequestResponder) {
                throw new Error('A custom request arrived but this test cell has no customRequestResponder configured');
              }
              if (!recipientAccount) {
                throw new Error('A custom request arrived before the recipient wallet was created');
              }
              customRequestCount++;
              const respond = customRequestResponder(
                walletRecipient,
                additionallyFundedAccounts[0],
                await recipientAccount.getCompleteAddress(),
              );
              return respond(request);
            },
          },
        },
      }));

      ({ wallet: walletRecipient, teardown: teardownRecipient } = await setupPXEAndGetWallet(
        aztecNode,
        aztecNode,
        {},
        undefined,
        'pxe-recipient',
      ));
      recipientAccount = await walletRecipient.createSchnorrAccount(
        additionallyFundedAccounts[0].secret,
        additionallyFundedAccounts[0].salt,
        additionallyFundedAccounts[0].signingKey,
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

    if (customRequestResponder) {
      it('the custom request hook fires exactly once, on the send that bootstraps the tagging secret', () => {
        expect(customRequestCount).toBe(1);
      });
    }

    additionalTests?.();
  });
}
