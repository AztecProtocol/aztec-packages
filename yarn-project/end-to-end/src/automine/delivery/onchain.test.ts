import type { InitialAccountData } from '@aztec/accounts/testing';
import { Point } from '@aztec/foundation/curves/grumpkin';
import type { ResolveCustomRequest } from '@aztec/pxe/config';
import { deriveMasterMessageSigningSecretKey } from '@aztec/stdlib/keys';
import { createInteractiveHandshakeResolver, createInteractiveHandshakeResponder } from '@aztec/wallet-sdk/delivery';

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

  buildMessageDeliveryTest({
    strategy: 'interactive handshake',
    mode: 'constrained',
    senderHook: () => Promise.resolve({ type: 'interactive-handshake' }),
    customRequestResponder: interactiveHandshakeResponder,
  });

  buildMessageDeliveryTest({
    strategy: 'interactive handshake',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'interactive-handshake' }),
    customRequestResponder: interactiveHandshakeResponder,
  });

  // Serves the registry's interactive-handshake signature request for the recipient: the wallet-sdk responder wrapped
  // in the resolver that serves the sender PXE's custom-request hook.
  function interactiveHandshakeResponder(
    recipientWallet: TestWallet,
    recipientAccount: InitialAccountData,
  ): ResolveCustomRequest {
    const responder = createInteractiveHandshakeResponder({
      pxe: recipientWallet,
      // The master message-signing secret key is deliberately never held by PXE or the key store; the wallet
      // derives it client-side from the account secret.
      getSigningKey: () => Promise.resolve(deriveMasterMessageSigningSecretKey(recipientAccount.secret)),
      // Backup durability is a wallet concern with no onchain effect; its semantics are pinned in the wallet-sdk
      // unit suite, so this cell passes a no-op backup.
      backup: () => Promise.resolve(),
    });
    return createInteractiveHandshakeResolver(responder);
  }
});
