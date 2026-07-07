import type { InitialAccountData } from '@aztec/accounts/testing';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import {
  parseInteractiveHandshakeRequest,
  recipientSignatureToFields,
  signInteractiveHandshake,
} from './interactive_handshake_responder.js';
import { type CustomRequestHook, buildMessageDeliveryTest } from './onchain_delivery_harness.js';

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

  // Serves the registry's interactive-handshake signature request for the recipient: registers the handshake on the
  // recipient PXE, then answers with the signed response.
  function interactiveHandshakeResponder(
    recipientWallet: TestWallet,
    recipientAccount: InitialAccountData,
    recipientCompleteAddress: CompleteAddress,
  ): CustomRequestHook {
    return async request => {
      const parsed = parseInteractiveHandshakeRequest(request);

      // Register before signing.
      await recipientWallet.registerTaggingSecretSource({
        kind: 'handshake',
        recipient: parsed.recipient,
        ephPk: parsed.ephPkX,
      });

      // The master message-signing secret key is deliberately never held by PXE or the key store; the wallet
      // derives it client-side from the account secret.
      const { masterMessageSigningSecretKey } = await deriveKeys(recipientAccount.secret);
      const recipientSignature = await signInteractiveHandshake(
        parsed,
        recipientCompleteAddress,
        masterMessageSigningSecretKey,
      );
      return recipientSignatureToFields(recipientSignature);
    };
  }
});
