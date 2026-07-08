import { Point } from '@aztec/foundation/curves/grumpkin';

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

  // With the recipient registering the sender,
  // the recipient PXE reconstructs the address-derived tag and discovers the delivery.
  buildMessageDeliveryTest({
    strategy: 'address-derived',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'address-derived' }),
    recipientRegistration: async (recipientWallet, _recipientAddress, senderAddress) => {
      await recipientWallet.registerSender(senderAddress);
    },
  });
});
