import type { InitialAccountData } from '@aztec/accounts/testing';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { Point } from '@aztec/foundation/curves/grumpkin';
import type { ResolveCustomRequest } from '@aztec/pxe/config';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';
import {
  type InteractiveHandshakeBackupEntry,
  createInteractiveHandshakeResolver,
  createInteractiveHandshakeResponder,
} from '@aztec/wallet-sdk/delivery';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { buildMessageDeliveryTest } from './onchain_delivery_harness.js';

describe('onchain delivery', () => {
  let arbitrarySecret: Point;

  beforeAll(async () => {
    arbitrarySecret = await Point.random();
  });

  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: 'constrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  buildMessageDeliveryTest({
    strategy: 'arbitrary secret',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'arbitrary-secret', secret: arbitrarySecret }),
    recipientRegistration: async (recipientWallet, recipientAddress) => {
      await recipientWallet.registerTaggingSecretSource({
        kind: 'arbitrary-secret',
        recipient: recipientAddress,
        secret: arbitrarySecret,
      });
    },
  });

  // With the recipient registering the sender, the recipient PXE reconstructs the address-derived tag
  // and discovers the delivery.
  buildMessageDeliveryTest({
    strategy: 'address-derived',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'address-derived' }),
    recipientRegistration: async (recipientWallet, _recipientAddress, senderAddress) => {
      await recipientWallet.registerSender(senderAddress);
    },
  });

  {
    const constrained = makeInteractiveHandshakeCell();
    buildMessageDeliveryTest({
      strategy: 'interactive handshake',
      mode: 'constrained',
      senderHook: () => Promise.resolve({ type: 'interactive-handshake' }),
      customRequestResponder: constrained.customRequestResponder,
      additionalTests: constrained.additionalTests,
    });

    const unconstrained = makeInteractiveHandshakeCell();
    buildMessageDeliveryTest({
      strategy: 'interactive handshake',
      mode: 'unconstrained',
      senderHook: () => Promise.resolve({ type: 'interactive-handshake' }),
      customRequestResponder: unconstrained.customRequestResponder,
      additionalTests: unconstrained.additionalTests,
    });
  }

  // Builds one cell's interactive-handshake wiring: the wallet-sdk responder (validate, register with the recipient
  // PXE, persist the backup, sign) wrapped in the resolver that serves the sender PXE's custom-request hook. Backup
  // state is per cell so the constrained and unconstrained cells cannot interfere.
  function makeInteractiveHandshakeCell() {
    const backups: InteractiveHandshakeBackupEntry[] = [];
    let recipient: AztecAddress | undefined;

    const customRequestResponder = (
      recipientWallet: TestWallet,
      recipientAccount: InitialAccountData,
      recipientCompleteAddress: CompleteAddress,
    ): ResolveCustomRequest => {
      recipient = recipientCompleteAddress.address;
      const responder = createInteractiveHandshakeResponder({
        pxe: recipientWallet,
        // The master message-signing secret key is deliberately never held by PXE or the key store; the wallet
        // derives it client-side from the account secret.
        getSigningKey: () => Promise.resolve(deriveMasterMessageSigningSecretKey(recipientAccount.secret)),
        backup: {
          store: entry => {
            backups.push(entry);
            return Promise.resolve();
          },
        },
      });
      return createInteractiveHandshakeResolver(responder);
    };

    const additionalTests = () => {
      it('persists exactly one backup entry, for the recipient, on the bootstrapping send', () => {
        expect(backups).toHaveLength(1);
        expect(backups[0].recipient.equals(recipient!)).toBe(true);
      });
    };

    return { customRequestResponder, additionalTests };
  }
});
