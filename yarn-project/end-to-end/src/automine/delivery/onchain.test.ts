import { Point } from '@aztec/foundation/curves/grumpkin';

import { buildMessageDeliveryTest } from './onchain_delivery_harness.js';

describe('onchain delivery', () => {
  // constrained always goes through a handshake. Stated explicitly rather than relying on the PXE default.
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: 'constrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  // unconstrained delivery whose source the wallet pins to a non-interactive handshake. The first send
  // bootstraps the handshake; the recipient PXE discovers it via the registry and reads the unconstrained logs.
  buildMessageDeliveryTest({
    strategy: 'non-interactive handshake',
    mode: 'unconstrained',
    senderHook: () => Promise.resolve({ type: 'non-interactive-handshake' }),
  });

  // unconstrained delivery tagged with a raw secret the two parties share out of band. Generated once in a
  // beforeAll that runs before any send can fire the sender hook, so both the hook and the recipient registration
  // read the same point instead of one of them computing it as a side effect of the other.
  let arbitrarySecret: Point;
  beforeAll(async () => {
    arbitrarySecret = await Point.random();
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
});
